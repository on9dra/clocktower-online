// 房間密碼：說書人點頂欄的鎖設定；新來的人進房前輸入。4 位數字，和大廳的房間號同一種方格
import { h, modal, closeModal } from './ui.js';
import { codeBox } from './lobby.js';

const passInput = value => h('input', { value, inputmode: 'numeric', autocomplete: 'off', 'aria-label': '房間密碼' });

// 新來的人：輸滿 4 位就試，輸錯方格晃一下、清空重輸。attempt(密碼) 返回進去了沒有
export function askPass(attempt) {
  const input = passInput(''), box = codeBox(input);
  const go = async () => {
    if (input.value.length < 4 || input.disabled) return;
    input.disabled = true;
    const ok = await attempt(input.value);
    input.disabled = false;
    if (ok) return closeModal();
    input.value = '';
    input.dispatchEvent(new Event('input'));
    box.classList.add('wrong');
    input.focus();
  };
  input.addEventListener('input', () => {
    if (input.value) box.classList.remove('wrong');
    go();
  });
  modal('房間密碼', h('div', { class: 'pass-form' }, box), { cls: 'pass-modal' });
  input.focus();
}

// 說書人：設定、改密碼、取消密碼
export function openPass(ctx, from) {
  const pass = ctx.state.pass || '', input = passInput(pass);
  const save = v => ctx.st('pass', { pass: v }).then(r => r.ok && closeModal());
  const yes = h('button', { class: 'btn', disabled: pass ? null : true, onclick: () => save(input.value) }, '確定');
  input.addEventListener('input', () => { yes.disabled = input.value.length < 4; });
  input.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) yes.click(); };
  modal('房間密碼', h('div', { class: 'pass-form' }, codeBox(input),
    h('div', { class: 'row' }, pass && h('button', { class: 'btn ghost', onclick: () => save('') }, '取消密碼'), yes)),
  { cls: 'pass-modal', from, away: () => document.querySelector('.topbar .lock') });
  input.focus();
  input.select();
}
