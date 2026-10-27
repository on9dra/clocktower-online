// 終局後獲勝一方自己的桌面上零星地放煙花，直到開新一局（說書人和輸的一方沒有）：
// 一顆紙片拖著墨線升上去，炸開成一圈帶墨邊的短線和紙屑，平塗、不發光。煙花聲壓得很低；「⋯ → 設置」可以關掉煙花或煙花聲
import { h } from './ui.js';
import { play, prefs } from './sfx.js';

const COLORS = { good: ['#2f5d8a', '#e9c46a', '#9a7a2f', '#fbf8f0'], evil: ['#8a1c1c', '#e9c46a', '#9a7a2f', '#2a2622'] };
let team = null, timer = null, layer = null, busy = () => false;
const f1 = n => Math.round(n * 10) / 10;
// 擋操作的演出在播時不放（fx.js 設進來）
export const setBusy = fn => { busy = fn; };
function getLayer() {
  if (!layer || !layer.isConnected) { layer = h('div', { id: 'fireworks', 'aria-hidden': 'true' }); document.body.append(layer); }
  return layer;
}

// t：上一局獲勝的陣營（'good' / 'evil'），null 停
export function setFireworks(t) {
  if (t === team) return;
  team = t;
  clearTimeout(timer);
  timer = null;
  if (team) next(1200);
}
function next(ms) {
  timer = setTimeout(() => {
    if (!document.hidden && !busy() && prefs().fw) launch();
    next(1700 + Math.random() * 2300);
  }, ms);
}

function launch() {
  const r = (document.querySelector('.ring') || document.querySelector('.board'))?.getBoundingClientRect();
  if (!r?.width) return;
  const x = r.left + r.width * (0.16 + Math.random() * 0.68), y = r.top + r.height * (0.1 + Math.random() * 0.5);
  const x0 = x + (Math.random() - 0.5) * r.width * 0.16, y0 = r.bottom - r.height * 0.04, rise = 650 + Math.random() * 200;
  const ang = Math.atan2(y - y0, x - x0) * 180 / Math.PI + 90;
  const el = h('i', { class: 'fw-rise', style: { left: x0 + 'px', top: y0 + 'px', background: COLORS[team][2] } });
  getLayer().append(el);
  el.animate([{ transform: `translate(0,0) rotate(${f1(ang)}deg)`, opacity: 0 }, { opacity: 1, offset: 0.15 },
    { transform: `translate(${f1(x - x0)}px, ${f1(y - y0)}px) rotate(${f1(ang)}deg)`, opacity: 1 }],
  { duration: rise, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
  setTimeout(() => el.remove(), rise + 30);
  const t = team;
  setTimeout(() => burst(x, y, t, Math.min(r.width, r.height) * (0.11 + Math.random() * 0.07)), rise);
}

// 在 (x, y) 炸開一朵：一圈短線往外射、一圈墨線散開、幾片紙屑飄落。R 是半徑；quiet 不出聲（演出裏自己配音）；
// parent：放在哪一層（演出裏放進舞台，蓋在紙牌上面）
export function burst(x, y, t, R, quiet = false, parent = getLayer()) {
  const pal = COLORS[t] || COLORS.good, main = pal[Math.random() < 0.6 ? 0 : 1], n = 14;
  if (!quiet && prefs().fwSound) play('fw', 0.35);
  const box = h('div', { class: 'fw-burst', style: { left: x + 'px', top: y + 'px' } });
  parent.append(box);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360 + Math.random() * 10, len = R * (0.85 + Math.random() * 0.3);
    const sp = h('i', { class: 'fw-spark', style: { background: i % 3 === 2 ? pal[2] : main, height: f1(R * 0.3) + 'px' } });
    box.append(sp);
    sp.animate([{ transform: `rotate(${f1(a)}deg) translateY(0) scaleY(.2)`, opacity: 1 },
      { transform: `rotate(${f1(a)}deg) translateY(${f1(-len)}px) scaleY(1)`, opacity: 1, offset: 0.5 },
      { transform: `rotate(${f1(a)}deg) translateY(${f1(-len * 1.12)}px) scaleY(.3)`, opacity: 0 }],
    { duration: 950, easing: 'cubic-bezier(.15,.7,.35,1)', fill: 'forwards' });
  }
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, d = R * (0.4 + Math.random() * 0.7), cx = Math.cos(a) * d, cy = Math.sin(a) * d;
    const bit = h('i', { class: 'fw-bit', style: { background: pal[i % pal.length] } });
    box.append(bit);
    bit.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${f1(cx)}px, ${f1(cy)}px) rotate(${Math.round(Math.random() * 360)}deg)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${f1(cx * 1.1)}px, ${f1(cy + R)}px) rotate(${Math.round(Math.random() * 720)}deg)`, opacity: 0 }],
    { duration: 1500 + Math.random() * 700, easing: 'ease-out', fill: 'forwards' });
  }
  const ring = h('i', { class: 'fw-ring', style: { borderColor: main, width: R + 'px', height: R + 'px', margin: `${-R / 2}px 0 0 ${-R / 2}px` } });
  box.append(ring);
  ring.animate([{ transform: 'scale(.2)', opacity: 0.9 }, { transform: 'scale(1.7)', opacity: 0 }], { duration: 620, easing: 'ease-out', fill: 'forwards' });
  setTimeout(() => box.remove(), 2400);
}
