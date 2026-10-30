// 實體感：鼠標指著的控件當成一塊實物，按在哪邊哪邊下陷，厚度和高光跟著轉（樣式見 style.css .tilt）。
// 全站一個委托，只改指著的那一個節點的變量；重繪換掉節點也沒關係，下一次移動會找到新節點
const PICK = '.token, .btn, .vbtn, .opt-tile, .hud-row, .setup-role, .chip, .mycard, .join, .recent-room, .tr-tbtn, .aim-btn, .mvp-btn, .it-dot';
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = v => Math.max(-1, Math.min(1, v));
let on = null, box = null, raf = 0, last = null;

function leave() {
  const el = on;
  on = null;
  if (!el) return;
  el.style.setProperty('--nx', 0);
  el.style.setProperty('--ny', 0);
  el.classList.add('untilt');
  // 回彈完才摘掉：摘早了 transform 一下子沒了，看著像跳一下
  setTimeout(() => {
    if (el === on) return;
    el.classList.remove('tilt', 'untilt');
    el.style.removeProperty('--nx');
    el.style.removeProperty('--ny');
  }, 460);
}

function tick() {
  raf = 0;
  const el = last?.target?.closest?.(PICK) || null;
  if (el !== on || (on && !on.isConnected)) {
    leave();
    if (el) {
      el.classList.remove('untilt');
      box = el.getBoundingClientRect(); // 進入時量一次：牌傾斜時邊緣不會在鼠標底下進進出出
      on = el;
      el.classList.add('tilt');
    }
  }
  if (!on) return;
  on.style.setProperty('--nx', clamp((last.clientX - box.left) / box.width * 2 - 1).toFixed(3));
  on.style.setProperty('--ny', clamp((last.clientY - box.top) / box.height * 2 - 1).toFixed(3));
}

let armed = false;
export function tactile() {
  if (armed) return;
  armed = true;
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || calm()) return;
    last = e;
    raf ||= requestAnimationFrame(tick);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { last = null; leave(); });
}
