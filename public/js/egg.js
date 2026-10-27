// 扔雞蛋（像歡樂鬥地主）：蛋從扔的人座位沿弧線轉著飛到目標頭像上砸開——蛋殼碎片彈開、蛋液濺出去，
// 一攤蛋清裹著蛋黃糊在頭像上，往下淌幾道，幾秒後淡掉。不進演出隊列、不擋操作，所有人都看得到；同一個頭像可以疊好幾攤
import { h } from './ui.js';
import { play } from './sfx.js';

let seen = 0, who = null, layer = null;
const NS = 'http://www.w3.org/2000/svg';
const INK = '#2a2622', WHITE = '#fffdf3', YOLK = '#f2b632';
const f1 = n => Math.round(n * 10) / 10;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function svg(inner, cls = '') {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 100 100');
  if (cls) el.setAttribute('class', cls);
  el.innerHTML = inner;
  return el;
}
function getLayer() {
  if (!layer || !layer.isConnected) { layer = h('div', { id: 'eggs', 'aria-hidden': 'true' }); document.body.append(layer); }
  return layer;
}
function tokenAt(id) {
  const el = document.querySelector(`.seat[data-key="${id}"] .token`);
  const r = el?.getBoundingClientRect();
  return r?.width ? { el, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } : null;
}

// 收到狀態時調用：播新扔的蛋（首次載入、換視角不補播；斷線一陣子回來只補最近幾秒的）
export function onEggs(s) {
  const id = `${s.code}:${s.isSt ? 'st' : s.myId}:${s.peek?.seatId || ''}`, list = s.eggs || [];
  const top = list.length ? list.at(-1).seq : 0;
  if (who !== id) { who = id; seen = top; return; }
  for (const e of list) if (e.seq > seen && (!e.at || e.at > s.serverNow - 6000) && !document.hidden) toss(e.from, e.to);
  seen = Math.max(seen, top);
}

const EGG = `<path d="M50 5C33 5 19 33 19 56c0 20 14 37 31 37s31-17 31-37C81 33 67 5 50 5z" fill="${WHITE}" stroke="${INK}" stroke-width="6"/>`
  + `<ellipse cx="38" cy="38" rx="6" ry="10" fill="#efe6cf"/>`;

export async function toss(from, to) {
  const b = tokenAt(to);
  if (!b) return;
  if (reduced()) return splat(b);
  const a = tokenAt(from) || { x: innerWidth / 2, y: innerHeight, w: b.w };
  const size = Math.max(18, b.w * 0.34);
  const egg = h('div', { class: 'egg-fly', style: { left: a.x - size / 2 + 'px', top: a.y - size / 2 + 'px', width: size + 'px', height: size + 'px' } }, svg(EGG));
  getLayer().append(egg);
  const dx = b.x - a.x, dy = b.y - b.w * 0.08 - a.y, dist = Math.hypot(dx, dy), lift = Math.min(170, dist * 0.45 + 30);
  const spin = (dx >= 0 ? 1 : -1) * (420 + Math.random() * 300);
  const ms = 460 + Math.min(280, dist * 0.3);
  play('toss', 0.8);
  egg.animate(Array.from({ length: 11 }, (_, i) => {
    const t = i / 10;
    return { offset: t, transform: `translate(${f1(dx * t)}px, ${f1(dy * t - lift * 4 * t * (1 - t))}px) rotate(${f1(spin * t)}deg) scale(${f1(0.75 + 0.4 * Math.sin(Math.PI * t))})` };
  }), { duration: ms, easing: 'cubic-bezier(.3,.15,.7,.95)', fill: 'forwards' });
  await sleep(ms);
  egg.remove();
  splat(tokenAt(to) || b); // 飛的時候座位可能挪了，按落地時的位置砸
}

// 一攤濺開的蛋清：一圈長短不齊的尖角，用二次曲線連起來
function blob(cx, cy, r, n) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.25, k = i % 2 ? 0.62 + Math.random() * 0.2 : 0.95 + Math.random() * 0.4;
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k];
  });
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let d = `M${mid(pts[n - 1], pts[0]).map(f1).join(' ')}`;
  pts.forEach((p, i) => { const m = mid(p, pts[(i + 1) % n]); d += `Q${f1(p[0])} ${f1(p[1])} ${f1(m[0])} ${f1(m[1])}`; });
  return d + 'Z';
}
function splatSvg() {
  const yx = 50 + (Math.random() - 0.5) * 12, yy = 46 + (Math.random() - 0.5) * 10;
  const drips = Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => {
    const x = 32 + Math.random() * 36, w = 6 + Math.random() * 4, len = 16 + Math.random() * 22;
    return `<rect class="drip" x="${f1(x - w / 2)}" y="58" width="${f1(w)}" height="${f1(len)}" rx="${f1(w / 2)}" fill="${WHITE}" stroke="${INK}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  return drips
    + `<path d="${blob(50, 50, 34, 16)}" fill="${WHITE}" stroke="${INK}" stroke-width="1.8" vector-effect="non-scaling-stroke"/>`
    + `<circle cx="${f1(yx)}" cy="${f1(yy)}" r="14" fill="${YOLK}" stroke="${INK}" stroke-width="1.8" vector-effect="non-scaling-stroke"/>`
    + `<ellipse cx="${f1(yx - 5)}" cy="${f1(yy - 5)}" rx="4" ry="3" fill="#fbe2a0"/>`;
}
const SHELL = `<polygon points="8,0 100,24 74,100 0,66" fill="${WHITE}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>`;

// 砸中：頭像挨一下，蛋清在頭像上攤開，蛋殼和蛋液往外濺、往下掉；蛋液慢慢往下淌，然後淡掉
function splat(b) {
  play('splat');
  b.el.animate([{ transform: 'none' }, { transform: 'scale(.86) rotate(-7deg)', offset: 0.3 }, { transform: 'scale(1.04) rotate(3deg)', offset: 0.65 }, { transform: 'none' }],
    { duration: 420, easing: 'ease-out' });
  const d = b.w * 1.12, cx = b.x, cy = b.y - b.w * 0.06;
  const box = h('div', { class: 'egg-splat', style: { left: cx - d / 2 + 'px', top: cy - d / 2 + 'px', width: d + 'px', height: d + 'px' } }, svg(splatSvg()));
  getLayer().append(box);
  box.animate([{ transform: `scale(.2) rotate(${f1((Math.random() - 0.5) * 60)}deg)`, opacity: 0 }, { transform: 'scale(1.12)', opacity: 1, offset: 0.55 }, { transform: 'none', opacity: 1 }],
    { duration: 200, easing: 'ease-out' });
  box.querySelectorAll('.drip').forEach((el, i) => el.animate([{ transform: 'scaleY(.05)' }, { transform: 'scaleY(1)' }],
    { duration: 1500 + i * 400, delay: 180, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'both' }));
  if (!reduced()) {
    for (let i = 0; i < 4; i++) bit(cx, cy, b.w, 'shell');
    for (let i = 0; i < 7; i++) bit(cx, cy, b.w, i % 3 ? 'white' : 'yolk');
  }
  box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 2700, fill: 'forwards' });
  setTimeout(() => box.remove(), 3450);
}
// 濺出去的一小片：蛋殼（帶墨線的白色碎片）或蛋液（小圓點），先往外彈，再往下掉
function bit(cx, cy, w, kind) {
  const shell = kind === 'shell', s = shell ? w * 0.17 : w * (0.06 + Math.random() * 0.05);
  const el = shell ? h('div', { class: 'egg-bit' }, svg(SHELL)) : h('i', { class: 'egg-bit ' + kind });
  Object.assign(el.style, { left: cx - s / 2 + 'px', top: cy - s / 2 + 'px', width: s + 'px', height: s + 'px' });
  getLayer().append(el);
  const a = Math.random() * Math.PI * 2, dist = w * (0.45 + Math.random() * 0.55);
  const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist * 0.7 - w * 0.25, fall = w * (0.5 + Math.random() * 0.4), rot = (Math.random() - 0.5) * 600;
  const ms = 650 + Math.random() * 350;
  setTimeout(() => el.remove(), ms + 50);
  el.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 },
    { transform: `translate(${f1(dx * 0.6)}px, ${f1(dy * 0.6)}px) rotate(${f1(rot * 0.5)}deg)`, opacity: 1, offset: 0.35 },
    { transform: `translate(${f1(dx)}px, ${f1(dy + fall)}px) rotate(${f1(rot)}deg)`, opacity: 0 }],
  { duration: ms, easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' });
}
