// 角色技能的演出：在桌面上演（和貞潔者反噬、獵手射殺一樣），不出紙牌；是演出，不是信息告知。
// 觀眾：自己（選完人 act、收到信息 info、接任惡魔 demon；不擋操作，也不卡說書人和下一個角色）、說書人魔典（grim，一拍，輕量，不擋操作）、
// 全桌（聖徒落敗、鎮長獲勝，擋操作）。口頭發動的技能（造謠者、雜耍藝人、月之子……）不演。
// 自己的演出要正式：壓暗 → 信物從自己的牌裏升起 → 每個角色自己的一套戲（不靠連線）→ 得到的信息落在桌心停一會 →
// 收進左上角面板，或落到對應座位旁邊（面板那一行和座位標記等演出播完才出現，見 fx.js msgHeld）→ 壓暗退掉。
// 印刷墨水的質感：單個零件按網點顯影（全屏不用網點，晃眼），章有套色錯位和磨損，濺墨、墨霧、紙屑做粒子；信物是 game-icons 線稿做的紙偶（props.js）。
// 不露餡：醉酒、中毒的人看到的和真角色一模一樣（說書人那邊才有虛線和「失效」）；小惡魔只演出手，不演生死；共情者只聽心跳，不標誰邪惡；天亮的死亡照舊是通用的「死亡」
// 黯月初升、夢殞春宵的角色在 fx-ab-dlc.js：用這裏的工具箱（T），不是暗流湧動的房間才下載
import { h, roleToken } from './ui.js';
import { icon, roleIcon } from './glyph.js';
import { ROLES, TEAMS } from './roles.js';
import { PROPS } from './props.js';

const NS = 'http://www.w3.org/2000/svg';
const C = { poison: '#3d8b3d', good: 'var(--good)', evil: 'var(--evil)', brass: 'var(--brass)', gray: 'var(--muted)', night: '#4a5272', ink: 'var(--ink)', paper: 'var(--card)' };
const col = t => C[t] || t;
const teamCol = id => TEAMS[ROLES[id]?.team]?.color || C.ink;
const TAU = Math.PI * 2, rand = (a, b) => a + Math.random() * (b - a), any = a => a[Math.floor(Math.random() * a.length)];
// 壓暗：自己看的壓得深一點，惡魔的偏紅，全桌的和反噬一樣
const SELF_WASH = '#141826a6', PUB_WASH = '#2a262288', EVIL_WASH = '#1a0d10b8';
const HOLD = 1400; // 得到的信息在桌心停多久
// 草叉圖本身叉尖朝右下（約 135°）：轉 45° 才是叉尖朝下
const FORK_DOWN = 45;
// 放大鏡圖裏鏡片圓心的位置（紙偶框的比例，鏡片在右上）：答案要正好落在鏡片裏
const LENS = { x: 0.631, y: 0.363 };
// 自畫的小形狀：鎖孔、書籤絲帶、水滴
const KEYHOLE = '<path d="M50 12a19 19 0 0 0-9.5 35.4L33 88h34l-7.5-40.6A19 19 0 0 0 50 12z" style="fill:var(--ink);stroke:var(--card);stroke-width:7;paint-order:stroke;stroke-linejoin:round"/>';
const RIBBON = '<path d="M28 2h44v94L50 78 28 96z" style="fill:var(--brass);stroke:var(--ink);stroke-width:6;stroke-linejoin:round"/><path d="M38 8v66" style="stroke:var(--card);stroke-width:5;opacity:.55"/>';
const DROP = 'M12 2.5c-3.3 5-6.5 8.6-6.5 12.3a6.5 6.5 0 0 0 13 0C18.5 11.1 15.3 7.5 12 2.5z';
// 一團不規則的墨（墨跡、墨霧）：k 個點的圓上隨機起伏，再用二次曲線抹圓
function blobPath(k = 11, jag = 0.32) {
  const p = Array.from({ length: k }, (_, i) => { const a = i / k * TAU, r = 40 * (1 - jag / 2 + Math.random() * jag); return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r]; });
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], f = v => v.map(x => x.toFixed(1)).join(' ');
  let d = 'M' + f(m(p[k - 1], p[0]));
  for (let i = 0; i < k; i++) d += 'Q' + f(p[i]) + ' ' + f(m(p[i], p[(i + 1) % k]));
  return d + 'Z';
}

// 說書人魔典上各角色的信物（沒有的用選人提示裏的圖標）
const ST = {
  poisoner: { prop: 'poison-bottle', tone: 'poison' }, monk: { prop: 'prayer-beads', tone: 'good' }, butler: { prop: 'key', tone: 'brass' },
  imp: { prop: 'pitchfork', tone: 'evil' }, washerwoman: { prop: 'clothespin', tone: 'brass' }, fortuneteller: { prop: 'crystal-ball', tone: 'night' },
  librarian: { prop: 'open-book', tone: 'brass' }, investigator: { prop: 'magnifying-glass', tone: 'brass' }, chef: { prop: 'meat-cleaver', tone: 'brass' },
  empath: { prop: 'heart-beats', tone: 'evil' }, undertaker: { prop: 'tombstone', tone: 'gray' }, ravenkeeper: { prop: 'raven', tone: 'ink' },
  spy: { prop: 'spyglass', tone: 'evil' },
};

export function abilityFx({ wait, anim, sfx, getStage, seatAt, release, skipping, ACT_ICONS }) {
  // ———— 尺寸：一張座位牌的寬度 tk、圓桌中心 mid（每段開始時量一次） ————
  let tk = 64, mid = { x: innerWidth / 2, y: innerHeight / 2 }, lifted = [], veilEl = null, gen = 0, on = false;
  function begin() {
    const one = document.querySelector('.seat .token'), r = document.querySelector('.ring')?.getBoundingClientRect();
    tk = one?.getBoundingClientRect().width || 64;
    mid = r?.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
    lifted = []; veilEl = null; gen++; on = true;
  }
  const W = () => tk / 0.135; // 小桌演示裏的「桌寬」：拋物線高度按它算
  const at = id => seatAt(id);
  // 座位往桌心方向挪 k 個牌寬（信物出在座位內側，頂上的座位也不出畫）
  const inward = (id, k = 0.95) => {
    const p = at(id), dx = mid.x - p.x, dy = mid.y - p.y, L = Math.hypot(dx, dy) || 1;
    return { x: p.x + dx / L * tk * k, y: p.y + dy / L * tk * k };
  };
  const above = (id, k = 0.6) => { const p = at(id); return { x: p.x, y: p.y - tk * k }; };
  // 延時做一件事：這一段已經結束（或在快進）就不做了，免得零件掉到下一段的舞台上
  const later = (ms, fn) => { const g = gen; setTimeout(() => { if (on && g === gen && !skipping()) fn(); }, ms); };

  // ———— 零件 ————
  function svgEl(vb, inner, cls) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', vb);
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = inner;
    return s;
  }
  // 信物：紙偶剪影（墨線外框 → 紙色描邊 → 填色）；dash：說書人看到的失效版
  function sticker(name, tone, dash) {
    const p = `<path d="${PROPS[name] || ''}"/>`;
    return h('div', { class: 'stk' + (dash ? ' dash' : ''), style: { '--c': col(tone) } },
      svgEl('-40 -40 592 592', `<g class="o">${p}</g><g class="p">${p}</g><g class="f">${p}</g>`));
  }
  const flat = (name, tone) => svgEl('0 0 512 512', `<path d="${PROPS[name] || ''}" style="fill:${col(tone)}"/>`);
  // 紙片圓牌裏裝一件信物（說書人的一拍、選人的小記號）；沒有信物的角色用選人提示的圖標
  function chip(name, tone, dim) {
    const inner = PROPS[name] ? svgEl('0 0 512 512', `<path fill="currentColor" d="${PROPS[name]}"/>`) : icon(name);
    return h('div', { class: 'fx-chip' + (dim ? ' dim' : ''), style: { color: dim ? '' : col(tone) } }, inner);
  }
  // 舞台上放一個零件，中心在 (x, y)；under：墊在浮起的牌下面（壓暗的上面）；before：插在某個零件下面
  function put(child, x, y, w, ht = w, cls = '', before = null) {
    const el = h('div', { class: 'sp ab ' + cls, style: { left: x - w / 2 + 'px', top: y - ht / 2 + 'px', width: w + 'px', height: ht + 'px' } }, child);
    const st = getStage();
    if (before) st.insertBefore(el, before);
    else if (cls.includes('under')) st.insertBefore(el, veilEl ? veilEl.nextSibling : st.firstChild);
    else st.append(el);
    return el;
  }
  function dot(x, y, d, tone, cls = '') {
    const el = h('i', { class: 'ab-dot ' + cls, style: { '--c': col(tone), left: x - d / 2 + 'px', top: y - d / 2 + 'px', width: d + 'px', height: d + 'px' } });
    getStage().append(el);
    return el;
  }
  const place = (el, p) => { el.style.left = p.x - el.offsetWidth / 2 + 'px'; el.style.top = p.y - el.offsetHeight / 2 + 'px'; };
  const posOf = el => ({ x: parseFloat(el.style.left) + el.offsetWidth / 2, y: parseFloat(el.style.top) + el.offsetHeight / 2 });
  const cen = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
  const rot = el => el._rot || 0;
  const fade = (el, ms = 220) => el && anim(el, [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: ms, easing: 'ease-in' });
  const stop = el => el?.getAnimations().forEach(a => a.cancel());
  // 逐幀：跳過時直接到結尾；loop 的 fn 返回 false 就停
  function tween(ms, fn) {
    if (skipping()) { fn(1); return Promise.resolve(); }
    const t0 = performance.now();
    return new Promise(res => {
      const step = now => { const t = Math.min(1, (now - t0) / ms); fn(t); if (t < 1) requestAnimationFrame(step); else res(); };
      requestAnimationFrame(step);
    });
  }
  const loop = (el, fn) => { const step = () => { if (!el.isConnected || skipping() || fn() === false) return; requestAnimationFrame(step); }; requestAnimationFrame(step); };

  // ———— 印刷的質感 ————
  // 壓暗：一層平塗的暗色慢慢淡入，收尾時淡出
  function veil(c, ms = 420) {
    veilEl = h('i', { class: 'ab-wash', style: { background: c } });
    getStage().prepend(veilEl);
    anim(veilEl, [{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' });
  }
  // 顯影：一個零件按網點從無到有印出來
  function develop(el, ms = 420, g = Math.max(5, tk * 0.09)) {
    el.classList.add('ab-dev');
    el.style.setProperty('--dg', g + 'px');
    el.style.setProperty('--dv', '0px');
    const a = anim(el, [{ '--dv': '0px' }, { '--dv': g * 0.76 + 'px' }], { duration: ms, easing: 'cubic-bezier(.5,0,.75,1)' });
    if (!a) el.style.setProperty('--dv', '99px');
    return a;
  }
  // 信物砸在桌上後留下的一枚淺淺的印子
  function impress(name, tone, el) {
    const c = cen(el), im = put(flat(name, tone), c.x + tk * 0.04, c.y + tk * 0.07, c.w * 0.94, c.h * 0.94, 'under ab-imp');
    im.style.rotate = rot(el) + 'deg';
    anim(im, [{ opacity: 0 }, { opacity: 0.34, offset: 0.2 }, { opacity: 0.2 }], { duration: 1100, easing: 'ease-out' });
    return im;
  }

  // ———— 粒子 ————
  // 濺墨：大滴少、小滴多，有的拖成長條；keep：落在桌上留一會（慢慢吃進紙裏），否則飛完就散
  function burst(x, y, tone, { n = 14, R = tk, dir = null, spread = TAU, big = 1, streak = 0.4, keep = true, fall = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir == null ? Math.random() * TAU : dir + (Math.random() - 0.5) * spread;
      const s = Math.random() ** 2.4, d = tk * (0.03 + 0.13 * s) * big;
      const L = R * (0.3 + (1 - s) * 0.8) * rand(0.75, 1.1), ex = Math.cos(a) * L, ey = Math.sin(a) * L + fall;
      const st = s < 0.45 && Math.random() < streak ? 2.8 : 1, deg = (a * 180 / Math.PI).toFixed(1), ms = rand(260, 440);
      const el = dot(x, y, d, tone);
      anim(el, [{ transform: `translate(0,0) rotate(${deg}deg) scale(.3)`, opacity: 1 },
        { transform: `translate(${ex * 0.8}px, ${ey * 0.8}px) rotate(${deg}deg) scale(${st}, ${1 / Math.sqrt(st)})`, opacity: 1, offset: 0.6 },
        { transform: `translate(${ex}px, ${ey}px) rotate(${deg}deg) scale(1)`, opacity: keep ? 0.9 : 0 }], { duration: ms, easing: 'cubic-bezier(.12,.7,.3,1)' });
      if (keep) anim(el, [{ opacity: 0.9 }, { opacity: 0.4 }], { duration: 1000, delay: ms + 300, easing: 'ease-in' });
    }
  }
  // 拖尾：零件飛的時候身後落一串墨點，縮小散掉；el._trail = false 停
  function trail(el, tone, { gap = tk * 0.16, d = tk * 0.07, life = 420 } = {}) {
    let last = null;
    el._trail = true;
    loop(el, () => {
      if (!el._trail) return false;
      const c = cen(el);
      if (!last || Math.hypot(c.x - last.x, c.y - last.y) >= gap) {
        last = c;
        const p = dot(c.x + rand(-2, 2), c.y + rand(-2, 2), d * rand(0.6, 1.25), tone);
        anim(p, [{ opacity: 0.9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.25)' }], { duration: life, easing: 'ease-in' });
      }
    });
  }
  // 墨霧：幾團墨慢慢漲開、飄起、淡掉
  function puff(x, y, tone, { n = 3, R = tk * 0.35, d = tk * 0.6, rise = tk * 0.5, ms = 900, op = 0.4, delay = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = R * Math.random(), r0 = rand(-40, 40);
      const el = put(svgEl('0 0 100 100', `<path d="${blobPath()}" style="fill:${col(tone)}"/>`), x + Math.cos(a) * r, y + Math.sin(a) * r, d * rand(0.7, 1.2));
      el.style.opacity = 0;
      anim(el, [{ transform: `rotate(${r0}deg) scale(.25)`, opacity: 0 }, { transform: `translateY(${-rise * 0.4}px) rotate(${r0 + 20}deg) scale(.9)`, opacity: op, offset: 0.3 },
        { transform: `translateY(${-rise}px) rotate(${r0 + 50}deg) scale(1.5)`, opacity: 0 }], { duration: ms * rand(0.8, 1.2), delay: delay + i * 70, easing: 'cubic-bezier(.2,.6,.4,1)' });
    }
  }
  // 墨霧從 a 飄到 b（占卜師的兩個座位飄進水晶球、惡魔的力量流向接任的人）：一團團走彎路，不是一條線
  function wisp(a, b, tone, { n = 6, delay = 0, d = tk * 0.34, ms = 640, op = 0.6 } = {}) {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    for (let i = 0; i < n; i++) {
      const bend = (Math.random() - 0.5) * 0.5 * L, spin = rand(-200, 200);
      const el = put(svgEl('0 0 100 100', `<path d="${blobPath(9, 0.4)}" style="fill:${col(tone)}"/>`), a.x, a.y, d * rand(0.7, 1.2));
      el.style.opacity = 0;
      anim(el, Array.from({ length: 11 }, (_, k) => {
        const t = k / 10, off = Math.sin(t * Math.PI) * bend;
        return { offset: t, transform: `translate(${dx * t + nx * off}px, ${dy * t + ny * off}px) rotate(${t * spin}deg) scale(${0.5 + Math.sin(t * Math.PI) * 0.6 - t * 0.3})`,
          opacity: t < 0.15 ? t / 0.15 * op : t > 0.85 ? (1 - t) / 0.15 * op : op };
      }), { duration: ms * rand(0.85, 1.15), delay: delay + i * 70, easing: 'cubic-bezier(.4,0,.6,1)' });
    }
  }
  // 紙屑：小紙片蹦起來，翻著落下
  function flecks(x, y, { n = 8, R = tk * 0.9, tones = ['paper'] } = {}) {
    for (let i = 0; i < n; i++) {
      const w = tk * rand(0.08, 0.15), ht = w * rand(0.5, 0.9);
      const el = h('i', { class: 'ab-fleck', style: { '--c': col(any(tones)), left: x - w / 2 + 'px', top: y - ht / 2 + 'px', width: w + 'px', height: ht + 'px' } });
      getStage().append(el);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4, L = R * rand(0.45, 1), ex = Math.cos(a) * L, ey = Math.sin(a) * L, sp = rand(-540, 540);
      anim(el, [{ transform: 'translate(0,0) rotate(0) rotateX(0)', opacity: 1 },
        { transform: `translate(${ex}px, ${ey}px) rotate(${sp * 0.4}deg) rotateX(${sp}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${ex * 1.3}px, ${ey + tk * rand(0.6, 1.1)}px) rotate(${sp}deg) rotateX(${sp * 2}deg)`, opacity: 0 }], { duration: rand(800, 1200), easing: 'cubic-bezier(.2,.7,.5,1)' });
    }
  }
  // 浮塵：幾粒小墨點慢慢往上飄（停住的時候、施法的時候）
  function motes(x, y, tone, { n = 6, R = tk * 0.7, ms = 1300, d = tk * 0.05 } = {}) {
    for (let i = 0; i < n; i++) {
      const el = dot(x + rand(-R, R), y + rand(-R * 0.5, R * 0.5), d * rand(0.6, 1.4), tone);
      el.style.opacity = 0;
      anim(el, [{ transform: 'translate(0,0)', opacity: 0 }, { transform: `translate(${rand(-6, 6)}px, ${-tk * 0.3}px)`, opacity: 0.9, offset: 0.3 },
        { transform: `translate(${rand(-10, 10)}px, ${-tk * rand(0.8, 1.3)}px)`, opacity: 0 }], { duration: ms * rand(0.8, 1.2), delay: i * rand(60, 140), easing: 'ease-out' });
    }
  }
  // 紙剪的火苗：圍著一點竄起來
  function flames(x, y, { n = 6, R = tk * 0.55, d = tk * 0.42, tone = 'evil' } = {}) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rand(-0.3, 0.3), f = put(sticker('flame', tone), x + Math.cos(a) * R, y + Math.sin(a) * R * 0.6 + tk * 0.15, d * rand(0.7, 1.15), undefined, 'under');
      f.style.opacity = 0; f.style.transformOrigin = '50% 90%';
      anim(f, [{ transform: 'scale(.2, .1)', opacity: 0 }, { transform: `translateY(${-tk * 0.1}px) scale(1, 1.15) rotate(${rand(-8, 8)}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translateY(${-tk * 0.5}px) scale(.5, .8) rotate(${rand(-15, 15)}deg)`, opacity: 0 }], { duration: rand(520, 760), delay: i * 50, easing: 'ease-out' });
    }
  }
  // 土塊：拋物線甩出去，落地
  function clods(x, y, { n = 7, side = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const el = dot(x + rand(-0.3, 0.3) * tk, y, tk * rand(0.07, 0.15), 'ink', 'o');
      const vx = (side || any([-1, 1])) * rand(0.3, 1.1) * tk, up = rand(0.5, 1.1) * tk, fall = tk * rand(0.1, 0.35);
      anim(el, Array.from({ length: 9 }, (_, k) => { const t = k / 8; return { offset: t, transform: `translate(${vx * t}px, ${-up * 4 * t * (1 - t) + fall * t * t}px) rotate(${t * 200}deg)` }; }),
        { duration: rand(420, 600), easing: 'linear' });
      later(900, () => fade(el, 400));
    }
  }
  // 羽毛：左右擺著慢慢飄落
  function feathers(x, y, n = 3) {
    for (let i = 0; i < n; i++) {
      const f = put(sticker('feather', 'ink'), x + rand(-0.4, 0.4) * tk, y, tk * rand(0.28, 0.38));
      const sw = tk * rand(0.25, 0.45), fall = tk * rand(0.9, 1.5), r0 = rand(-30, 30);
      anim(f, Array.from({ length: 9 }, (_, k) => { const t = k / 8; return { offset: t, opacity: t > 0.75 ? (1 - t) * 4 : 1, transform: `translate(${Math.sin(t * Math.PI * 2.2) * sw}px, ${fall * t}px) rotate(${r0 + Math.sin(t * Math.PI * 2.2 + 1) * 35}deg)` }; }),
        { duration: rand(1100, 1500), delay: i * 90, easing: 'linear' });
    }
  }
  // 一滴水：從 (x, y) 落下，濺開
  function waterDrop(x, y) {
    const fall = tk * rand(0.6, 0.9), d = put(svgEl('0 0 24 24', `<path d="${DROP}" style="fill:var(--card);stroke:var(--good);stroke-width:2.2"/>`), x, y, tk * 0.17);
    anim(d, [{ transform: 'translateY(0) scale(.4, .6)', opacity: 0 }, { transform: 'translateY(2px) scale(1)', opacity: 1, offset: 0.2 },
      { transform: `translateY(${fall}px) scale(.9, 1.2)`, opacity: 1, offset: 0.9 }, { transform: `translateY(${fall + 2}px) scale(1.6, .3)`, opacity: 0 }], { duration: 440, easing: 'cubic-bezier(.5,0,1,.7)' });
    later(400, () => burst(x, y + fall + tk * 0.05, 'paper', { n: 4, R: tk * 0.22, keep: false, dir: -Math.PI / 2, spread: Math.PI, big: 0.45 }));
  }
  // 一直滴水，返回停止的函數
  function dripping(el, every = 300) {
    const g = gen;
    let go = true, n = 0;
    const tick = () => {
      if (!go || !el.isConnected || skipping() || g !== gen) return;
      const c = cen(el);
      waterDrop(c.x + rand(-0.18, 0.18) * tk, c.y + c.h * 0.4);
      if (n++ < 2) sfx('drip');
      setTimeout(tick, every * rand(0.8, 1.3));
    };
    setTimeout(tick, 100);
    return () => { go = false; };
  }

  // ———— 動作 ————
  function wash(c, ms) { veil(c, ms); }
  // 收尾：零件淡掉，浮起的牌落回座位，壓暗退掉
  async function finish(ms = 420) {
    const st = getStage();
    if (veilEl) anim(veilEl, [{ opacity: 1 }, { opacity: 0 }], { duration: ms + 140, easing: 'ease-in-out' });
    [...st.children].forEach((el, i) => {
      if (el === veilEl) return;
      if (lifted.includes(el)) anim(el, [{ transform: getComputedStyle(el).transform }, { transform: 'translateY(-3px)', offset: 0.6 }, { transform: 'none' }], { duration: ms, easing: 'ease-in-out' });
      else anim(el, [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: ms * 0.8, delay: Math.min(i, 30) * 5, easing: 'ease-in' });
    });
    await wait(ms + 140);
    restore();
  }
  function restore() {
    lifted.forEach(sp => { if (sp._home) sp._home.style.visibility = ''; });
    lifted = [];
  }
  // 整段包一層：開始量尺寸，不管怎麼結束都把藏起來的座位牌放回去。
  // 先等一拍：事件和新狀態一起到，界面要等 onState 之後才按新狀態重畫（終局翻開身份、座位挪位），量早了會對不齊
  const scene = fn => async (...a) => { await wait(0); begin(); try { await fn(...a); } finally { restore(); on = false; } };

  // 「噔」：從大砸下來落定
  function beat(el, snd) {
    el.style.opacity = 1;
    if (snd) sfx(snd);
    const r = rot(el);
    anim(el, [{ transform: `rotate(${r}deg) scale(2.2)`, opacity: 0 }, { transform: `rotate(${r}deg) scale(.94)`, opacity: 1, offset: 0.65 }, { transform: `rotate(${r}deg)`, opacity: 1 }],
      { duration: 220, easing: 'cubic-bezier(.4,0,.6,1)' });
  }
  function ring(x, y, tone, d = tk * 1.25, to = 1.8, ms = 480) {
    const el = h('i', { class: 'ab-ring', style: { '--c': col(tone), left: x - d / 2 + 'px', top: y - d / 2 + 'px', width: d + 'px', height: d + 'px', borderWidth: Math.max(2, tk * 0.05) + 'px' } });
    getStage().append(el);
    anim(el, [{ transform: 'scale(.6)', opacity: 0.9 }, { transform: `scale(${to})`, opacity: 0 }], { duration: ms, easing: 'ease-out' });
    return el;
  }
  // 壓扁回彈、晃一晃：用獨立的 scale / rotate，不和位置的 transform 打架
  const squash = (el, k = 1) => el && anim(el, [{ scale: '1', rotate: '0deg' }, { scale: `${1 + 0.06 * k} ${1 - 0.16 * k}`, rotate: `${-6 * k}deg`, offset: 0.25 },
    { scale: `${1 - 0.03 * k} ${1 + 0.05 * k}`, rotate: `${3 * k}deg`, offset: 0.6 }, { scale: '1', rotate: '0deg' }], { duration: 400, fill: 'none' });
  const wiggle = (el, k = 1) => anim(el, [0, -12, 10, -5, 0].map(d => ({ rotate: d * k + 'deg' })), { duration: 340, easing: 'ease-out', fill: 'none' });
  const bob = (el, amp = tk * 0.08, ms = 300) => anim(el, [{ translate: '0 0' }, { translate: `0 ${-amp}px` }, { translate: '0 0' }], { duration: ms, easing: 'ease-in-out', fill: 'none' });
  function blot(x, y, tone, d = tk * 1.5, op = 0.78) {
    const el = put(svgEl('0 0 100 100', `<path d="${blobPath(14, 0.36)}" style="fill:${col(tone)}"/>`), x, y, d);
    el.style.opacity = op;
    anim(el, [{ transform: 'scale(.15) rotate(-20deg)' }, { transform: 'scale(1.12) rotate(4deg)', offset: 0.6 }, { transform: 'scale(1) rotate(0)' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1)' });
    return el;
  }
  // 座位上的牌浮到壓暗的那層上面；plain：只浮上來，不跳；face：換一張牌面（接任惡魔時自己座位上還是原來的角色）
  function lift(id, plain, face) {
    const t = at(id).el;
    if (!t) return null;
    const r = t.getBoundingClientRect(), cl = face ? roleToken(face) : t.cloneNode(true);
    const name = t.querySelector('.token-name');
    cl.style.width = cl.style.height = '100%';
    if (name && cl.querySelector('.token-name')) cl.querySelector('.token-name').style.fontSize = getComputedStyle(name).fontSize;
    const sp = put(cl, r.left + r.width / 2, r.top + r.height / 2, r.width, r.height, 'lift');
    sp._home = t; t.style.visibility = 'hidden';
    lifted.push(sp);
    if (!plain) {
      anim(sp, [{ transform: 'none' }, { transform: `translateY(${-tk * 0.14}px) scale(1.14)`, offset: 0.5 }, { transform: `translateY(${-tk * 0.08}px) scale(1.08)` }], { duration: 260, easing: 'ease-out' });
      ring(r.left + r.width / 2, r.top + r.height / 2, 'brass', tk * 1.2, 1.6, 420);
    }
    return sp;
  }
  const tokOf = id => lifted.find(sp => sp._home === at(id).el) || at(id).el;
  const liftOf = id => lifted.find(sp => sp._home === at(id).el) || lift(id, true);
  // 浮起的牌翻面換成另一張角色
  async function flipTo(sp, roleId) {
    if (!sp) return;
    const name = sp.querySelector('.token-name');
    const fs = name && getComputedStyle(name).fontSize, tf = getComputedStyle(sp).transform;
    const base = tf === 'none' ? '' : tf;
    anim(sp, [{ transform: base + ' rotateY(0)' }, { transform: base + ' rotateY(90deg)' }], { duration: 130, easing: 'ease-in' });
    await wait(130);
    stop(sp);
    const t = roleToken(roleId);
    t.style.width = t.style.height = '100%';
    if (fs && t.querySelector('.token-name')) t.querySelector('.token-name').style.fontSize = fs;
    sp.replaceChildren(t);
    sfx('flip');
    anim(sp, [{ transform: base + ' rotateY(-90deg)' }, { transform: base || 'none' }], { duration: 200, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }
  // 沿弧線移動到 b，落定後把位置寫回 left / top
  async function moveTo(el, b, ms, o = {}) {
    const a = posOf(el), dx = b.x - a.x, dy = b.y - a.y, L = o.lift ?? Math.min(W() * 0.24, Math.hypot(dx, dy) * 0.4);
    const r0 = rot(el), r1 = o.rot ?? r0, spin = o.spin || 0, s0 = el._s ?? 1, s1 = o.s1 ?? s0;
    const frames = Array.from({ length: 13 }, (_, i) => {
      const t = i / 12;
      return { offset: t, transform: `translate(${dx * t}px, ${dy * t - L * 4 * t * (1 - t)}px) rotate(${r0 + (r1 - r0) * t + spin * 360 * t}deg) scale(${s0 + (s1 - s0) * t})` };
    });
    anim(el, frames, { duration: ms, easing: o.ease || 'cubic-bezier(.45,0,.35,1)' });
    await wait(ms);
    el.getAnimations().forEach(x => { if (x.effect?.getKeyframes().some(k => k.transform)) x.cancel(); });
    place(el, b);
    el._rot = r1 % 360; el._s = s1;
    el.style.transform = `rotate(${el._rot}deg) scale(${s1})`;
  }
  // 信物從自己的牌裏升起，落在座位內側
  async function emerge(name, tone, me, { size = tk * 1.1, to = inward(me), snd, r = 0 } = {}) {
    const m = at(me), pr = put(sticker(name, tone), m.x, m.y, size), dx = to.x - m.x, dy = to.y - m.y;
    motes(m.x, m.y, tone === 'ink' ? 'paper' : tone, { n: 6, R: tk * 0.4 });
    anim(pr, [{ transform: 'scale(.2)', opacity: 0 },
      { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - tk * 0.75}px) rotate(-10deg) scale(1.2)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${r}deg) scale(1)`, opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.3,.7,.35,1)' });
    await wait(520);
    stop(pr); place(pr, to);
    pr._rot = r; pr.style.transform = `rotate(${r}deg)`;
    if (snd) sfx(snd);
    ring(to.x, to.y, tone === 'ink' ? 'paper' : tone, tk * 1.1, 1.7, 420);
    squash(pr, 0.5);
    return pr;
  }
  // 蓋章：從大到小砸下來；套色錯位的那一版晚一點才對準，落定時一圈墨線散開、四周濺一圈小墨點
  async function slam(parent, text, tone, { soft, fs, snd } = {}) {
    const st = h('div', { class: 'ab-stamp', style: { '--c': col(tone), '--g': col(tone === 'brass' ? 'night' : 'brass'), fontSize: (fs || Math.max(18, tk * 0.42)) + 'px' } },
      h('b', { class: 'gh' }, text), h('b', {}, text));
    parent.append(st);
    if (soft) {
      anim(st, [{ transform: 'translate(-50%,-50%) scale(1.5) rotate(-4deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotate(-7deg)', opacity: 1 }], { duration: 360, easing: 'ease-out' });
      await wait(180);
      sfx(snd || 'stamp', 0.6);
      await wait(120);
      return st;
    }
    anim(st, [{ transform: 'translate(-50%,-50%) scale(3) rotate(-18deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(.92) rotate(-6deg)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%,-50%) rotate(-7deg)', opacity: 1 }], { duration: 230, easing: 'cubic-bezier(.5,0,.7,1)' });
    anim(st.firstChild, [{ translate: '.16em -.12em', opacity: 0.85 }, { translate: '.16em -.12em', opacity: 0.85, offset: 0.45 }, { translate: '0 0', opacity: 0 }], { duration: 600, easing: 'cubic-bezier(.3,0,.2,1)' });
    await wait(125); // 聲音跟著章落定，不是跟著它起手
    sfx(snd || 'stamp');
    await wait(40);
    const c = cen(st);
    ring(c.x, c.y, tone, c.h * 1.6, 2.2, 440);
    burst(c.x, c.y, tone, { n: 10, R: c.w * 0.6, big: 0.7, keep: false });
    await wait(60);
    return st;
  }
  const pad = p => { const el = h('div', { class: 'ab-pad', style: { left: p.x + 'px', top: p.y + 'px' } }); getStage().append(el); return el; };
  // 桌面某一點蓋章，返回章（之後收進面板用）
  const spotStamp = (p, text, tone, o = {}) => slam(pad(p), text, tone, o);
  // 座位上砸一枚章，停一下縮到座位下面；mk：說書人那邊留一枚小紙簽（玩家的座位標記由界面自己畫）
  // mark：章最後縮到座位底下那枚行動標記上（演出期間它已經排好、只是看不見）
  async function seatStamp(id, text, tone, o = {}) {
    const p = at(id), st = await slam(pad(p), text, tone, o);
    await wait(o.hold ?? 700);
    const m = o.mark && markAt(id, o.mark), sh = st.getBoundingClientRect().height || tk;
    anim(st, [{ transform: 'translate(-50%,-50%) rotate(-7deg)', opacity: 1 },
      m ? { transform: `translate(calc(-50% + ${m.x - p.x}px), calc(-50% + ${m.y - p.y}px)) rotate(-2deg) scale(${m.h * 1.1 / sh})`, opacity: 0 }
        : { transform: `translate(-50%, ${tk * 0.55}px) rotate(-5deg) scale(.4)`, opacity: 0 }], { duration: m ? 300 : 200, easing: 'cubic-bezier(.5,0,.6,1)' });
    await wait(m ? 280 : 170);
    if (o.mk) mk(id, text, tone);
  }
  function mk(id, text, tone) {
    const p = at(id), m = h('div', { class: 'ab-mk', style: { '--c': col(tone), left: p.x + 'px', top: p.y + tk * 0.5 + 'px', fontSize: Math.max(11, tk * 0.2) + 'px' } }, text);
    getStage().append(m);
    anim(m, [{ transform: 'translateX(-50%) rotate(-5deg) scale(1.6)', opacity: 0 }, { transform: 'translateX(-50%) rotate(-5deg)', opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }
  // 得到的信息在桌心停一會：輕輕起伏，四周飄起浮塵
  async function hold(els, tone = 'paper', ms = HOLD) {
    const live = els.filter(Boolean).map(e => anim(e, [{ translate: '0 0' }, { translate: `0 ${-tk * 0.05}px` }, { translate: '0 0' }], { duration: 1600, iterations: Infinity, easing: 'ease-in-out', fill: 'none' }));
    later(150, () => motes(mid.x, mid.y + tk * 0.2, tone, { n: 9, R: tk * 1.1, ms: 1600 }));
    await wait(ms);
    live.forEach(a => a?.cancel());
  }
  // 桌心的答案先微微一提，再沿弧線縮進左上角面板，身後拖一串墨點（面板那一行等演出播完才出現）
  async function toHud(els) {
    els = els.filter(Boolean);
    // 落點：面板裏那一行的位置（演出期間它已經排好、只是看不見）；面板收著就落到左上角的牌上
    const row = document.querySelector('.hud:not(.min) .hud-row.mk-held');
    const tg = row || document.querySelector('.hud:not(.min) .hud-list') || document.querySelector('.hud-me');
    if (!tg || !els.length) return;
    const r = tg.getBoundingClientRect(), exact = row || tg.classList.contains('hud-me');
    els.forEach(e => { e.style.transformOrigin = ''; });
    const b = exact ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: r.left + Math.min(r.width / 2, 60), y: r.top + Math.min(r.height / 2, 18) };
    sfx('whoosh', 0.6);
    els.forEach((e, i) => {
      const a = cen(e), dx = b.x - a.x, dy = b.y - a.y, L = Math.min(tk * 1.6, Math.hypot(dx, dy) * 0.25), base = e.style.transform || '';
      const vh = (e.querySelector('.ab-stamp') || e).getBoundingClientRect().height || tk, end = exact ? Math.min(1, Math.max(0.15, r.height * 0.9 / vh)) : 0.2;
      const frames = [{ offset: 0, transform: base, opacity: 1 }, { offset: 0.18, transform: `translateY(${tk * 0.1}px) ${base} scale(1.08)`, opacity: 1 }];
      for (let k = 1; k <= 10; k++) {
        const t = k / 10;
        frames.push({ offset: 0.18 + 0.82 * t, transform: `translate(${dx * t}px, ${dy * t - L * 4 * t * (1 - t)}px) ${base} scale(${1.08 + (end - 1.08) * t})`, opacity: t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1 });
      }
      anim(e, frames, { duration: 640, delay: i * 70, easing: 'cubic-bezier(.5,0,.4,1)' });
      trail(e, 'brass', { d: tk * 0.06, gap: tk * 0.18, life: 380 });
    });
    await wait(640 + (els.length - 1) * 70);
    els.forEach(e => { e._trail = false; });
    sfx('tag');
    ring(b.x, b.y, 'brass', tk * 0.6, 2, 360);
  }
  // 得到的結果落到對應的座位旁邊（座位底下那排標記的位置），停一下；演出播完界面就在那裏畫上標記。
  // 凡是答案落在具體某幾個人身上的（洗衣婦、圖書管理員、調查員、占卜師、送葬者、守鴉人、間諜）都這樣收，不進左上角面板
  // sel：落到座位底下哪一枚標記上（演出期間標記已經排好、只是看不見，見 side.js markView 的 held）；找不到就落在名牌下面
  async function toSeat(el, id, delay = 0, sel = '') {
    const seat = id && document.querySelector(`.seat[data-key="${id}"]`), r = seat?.getBoundingClientRect();
    if (!r) return toHud([el]);
    if (delay) await wait(delay);
    const p = at(id), m = markAt(id, sel), b = m || { x: p.x, y: r.bottom + tk * 0.24 }, size = m ? Math.min(m.w, m.h * 1.4) : tk * 0.5;
    el.style.transformOrigin = ''; // 錨點不在中心的話，縮小以後會偏離落點
    await fly(el, b, 540, 'brass', { lift: tk * 0.8, s1: size / el.offsetWidth, trail: { d: tk * 0.05 } });
    sfx('tag'); squash(el, 0.6); squash(tokOf(id), 0.3); ring(b.x, b.y, 'brass', tk * 0.7, 1.8, 420);
    await wait(760);
  }
  // 座位底下某一枚標記的位置（先找還沒放出來的那枚；同樣的標記之前就有，就找那枚）
  function markAt(id, sel) {
    const box = sel && document.querySelector(`.seat[data-key="${id}"] .pmarks`);
    const el = box && (box.querySelector('.mk-held' + sel) || box.querySelector(sel));
    const r = el?.getBoundingClientRect();
    return r?.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null;
  }
  // 一個答案落到好幾個人身邊：先一分為幾份往兩邊一錯開，再各自飛向自己的座位
  async function toSeats(el, ids, sel = '') {
    ids = ids.filter(id => id && document.querySelector(`.seat[data-key="${id}"]`));
    if (ids.length < 2) return ids.length ? toSeat(el, ids[0], 0, sel) : toHud([el]);
    el.classList.remove('ab-dev'); stop(el);
    const c = posOf(el), copies = ids.map((_, k) => {
      if (!k) return el;
      const cl = el.cloneNode(true);
      Object.assign(cl, { _s: el._s, _rot: el._rot });
      getStage().append(cl);
      return cl;
    });
    await Promise.all(copies.map((x, k) => moveTo(x, { x: c.x + (k - (ids.length - 1) / 2) * tk * 0.9, y: c.y }, 200, { lift: tk * 0.15 })));
    await Promise.all(copies.map((x, k) => toSeat(x, ids[k], k * 90, sel)));
  }
  // 兩半：把一個元素沿豎線劈開，兩半各自甩飛
  function halves(el, x, y, size, k = 1) {
    for (const s of [-1, 1]) {
      const h2 = put(el.cloneNode(true), x, y, size);
      h2.firstChild.style.clipPath = s < 0 ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)';
      anim(h2, [{ transform: 'none' }, { transform: `translate(${s * tk * 0.7 * k}px, ${-tk * 0.8 * k}px) rotate(${s * 160}deg)`, offset: 0.5 },
        { transform: `translate(${s * tk * 1.1 * k}px, ${tk * 0.4}px) rotate(${s * 280}deg)`, opacity: 0 }], { duration: 640, easing: 'cubic-bezier(.2,.6,.5,1)' });
    }
  }
  function drip(a, b, tone, ms = 200) {
    const d = put(svgEl('0 0 24 24', `<path d="${DROP}" style="fill:${col(tone)};stroke:${C.ink};stroke-width:1.6"/>`), a.x, a.y, tk * 0.3);
    sfx('drip');
    anim(d, [{ transform: 'translate(0,0) scale(.5)', opacity: 1 }, { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(1, 1.25)`, opacity: 1, offset: 0.9 },
      { transform: `translate(${b.x - a.x}px, ${b.y - a.y + 4}px) scale(1.6, .4)`, opacity: 0 }], { duration: ms, easing: 'cubic-bezier(.5,0,1,.6)' });
    return d;
  }
  // 心跳：撲通撲通兩下，牌跟著一跳，墨圈一圈圈散開（不帶顏色，不洩露誰邪惡）
  async function heartbeat(id, tone = 'paper') {
    const p = at(id), t = tokOf(id);
    sfx('beat2');
    for (const k of [1, 0.6]) {
      anim(t, [{ scale: '1' }, { scale: `${1 + 0.12 * k}` }, { scale: '1' }], { duration: 190, easing: 'ease-out', fill: 'none' });
      ring(p.x, p.y, tone, tk * 1.15, 1.5 + 0.35 * k, 460);
      await wait(210);
    }
  }
  const forkChip = () => { const c = chip('pitchfork', 'evil'); c.firstChild.style.rotate = FORK_DOWN + 'deg'; return c; };
  const atkChip = src => { const sp = ST[src]; return sp && src !== 'imp' ? chip(sp.prop, sp.tone) : forkChip(); };
  // 一件信物沿弧線飛過去，身後拖一串墨點
  async function fly(el, b, ms, tone, o = {}) {
    trail(el, tone, o.trail);
    sfx('whoosh', 0.6);
    await moveTo(el, b, ms, o);
    el._trail = false;
  }

  // ———— 自己：選完人 ————
  // 投毒者：毒瓶從牌裏升起，搖一搖，拖著綠點飛到目標頭頂；瓶塞崩開，一串毒液澆下去，綠墨在牌上按網點暈開、冒泡、冒煙
  const poisoner = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti);
    wash(SELF_WASH); lift(me); const tt = lift(ti, true);
    await wait(320);
    const btl = await emerge('poison-bottle', 'poison', me, { size: tk * 1.15 });
    sfx('rattle'); wiggle(btl, 1.2);
    later(120, () => { const c = posOf(btl); motes(c.x, c.y - tk * 0.4, 'poison', { n: 4, R: tk * 0.15 }); });
    await wait(360);
    await fly(btl, { x: p.x - tk * 0.35, y: p.y - tk * 1.45 }, 540, 'poison', { rot: 18, lift: W() * 0.16 });
    bob(btl, tk * 0.08, 280);
    await wait(240);
    // 瓶塞崩開
    const mouth = { x: p.x - tk * 0.22, y: p.y - tk * 1.9 };
    const cork = put(h('div', { class: 'fx-chip', style: { color: C.brass, borderWidth: '2px', boxShadow: 'none' } }), mouth.x, mouth.y, tk * 0.2);
    sfx('cork'); puff(mouth.x, mouth.y, 'poison', { n: 2, d: tk * 0.35, op: 0.5, rise: tk * 0.3 });
    anim(cork, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${-tk * 0.5}px, ${-tk * 0.8}px) rotate(-200deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${-tk * 0.9}px, ${tk * 0.2}px) rotate(-420deg)`, opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.2,.6,.6,1)' });
    await wait(120);
    anim(btl, [{ transform: 'rotate(18deg)' }, { transform: 'rotate(34deg)', offset: 0.3 }, { transform: 'rotate(132deg)' }], { duration: 220, easing: 'cubic-bezier(.4,0,.3,1)' });
    btl._rot = 132;
    await wait(220);
    // 一串毒液
    const from = { x: p.x + tk * 0.1, y: p.y - tk * 1.0 };
    for (let k = 0; k < 6; k++) {
      drip(from, { x: p.x + rand(-0.12, 0.12) * tk, y: p.y - tk * 0.1 }, 'poison', 200);
      later(200, () => { squash(tt, 0.25 + k * 0.05); burst(p.x, p.y - tk * 0.15, 'poison', { n: 4, R: tk * 0.45, keep: false, dir: -Math.PI / 2, spread: Math.PI * 1.4, big: 0.6 }); });
      await wait(k < 2 ? 110 : 70);
    }
    await wait(200);
    // 綠墨暈開、冒泡、冒煙
    sfx('splat');
    develop(blot(p.x, p.y, 'poison', tk * 1.55, 0.72), 520);
    burst(p.x, p.y, 'poison', { n: 16, R: tk * 1.15 });
    puff(p.x, p.y - tk * 0.3, 'poison', { n: 3, op: 0.35, rise: tk * 0.9, ms: 1200, delay: 200 });
    for (let k = 0; k < 3; k++) {
      const bx = p.x + (k - 1) * tk * 0.28, b = put(h('i', { class: 'ab-bubble' }), bx, p.y - tk * 0.15, tk * 0.2);
      b.style.opacity = 0;
      anim(b, [{ transform: 'translateY(0) scale(.3)', opacity: 0 }, { transform: `translateY(${-tk * 0.35}px) scale(1)`, opacity: 1, offset: 0.75 }, { transform: `translateY(${-tk * 0.45}px) scale(1.4)`, opacity: 0 }],
        { duration: 560, delay: 120 + k * 200, easing: 'ease-out' });
      later(120 + k * 200 + 520, () => { burst(bx, p.y - tk * 0.6, 'poison', { n: 4, R: tk * 0.25, keep: false, big: 0.5 }); });
    }
    anim(btl, [{ transform: 'rotate(132deg)' }, { transform: `translate(${-tk * 0.4}px, ${-tk * 0.5}px) rotate(0deg)`, opacity: 0 }], { duration: 420, easing: 'ease-in-out' });
    await wait(420);
    await seatStamp(ti, '中毒', 'poison', { mark: '[data-act="poisoner"]' });
    await finish();
  });

  // 小惡魔：牌伏低、四周竄起紙剪的火苗，草叉從牌裏升起，往後一掄，拖著血點高高擲出；頂點一頓，直插下去，紅墨炸開。只演出手，不演生死。選自己：叉子刺自己（傳位）
  const imp = scene(async (e, me) => {
    const ti = e.to[0], self = ti === me, m = at(me), p = at(ti);
    wash(EVIL_WASH);
    const own = lift(me, true), tt = self ? own : lift(ti, true);
    await wait(280);
    ring(m.x, m.y, 'evil', tk * 1.2, 1.6, 440);
    anim(own, [{ transform: 'none' }, { transform: 'scale(1.1, .8) translateY(8px)', offset: 0.6 }, { transform: 'scale(1.06, .86) translateY(6px)' }], { duration: 420, easing: 'ease-out' });
    sfx('fire');
    flames(m.x, m.y, { n: 7 });
    await wait(440);
    anim(own, [{ transform: 'scale(1.06, .86) translateY(6px)' }, { transform: 'scale(.94, 1.14) translateY(-12px)', offset: 0.4 }, { transform: 'scale(1.08) translateY(-6px)' }], { duration: 280, easing: 'ease-out' });
    const q0 = inward(me, 1.05), fork = put(sticker('pitchfork', 'evil'), m.x, m.y, tk * 1.35);
    anim(fork, [{ transform: 'scale(.3)', opacity: 0 }, { transform: `translate(${q0.x - m.x}px, ${q0.y - m.y - tk * 0.3}px) scale(1.12)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${q0.x - m.x}px, ${q0.y - m.y}px) scale(1)`, opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.3,1.2,.5,1)' });
    sfx('demon'); burst(m.x, m.y - tk * 0.3, 'evil', { n: 8, R: tk * 0.6, keep: false, dir: -Math.PI / 2, spread: Math.PI, big: 0.6 });
    await wait(380);
    stop(fork); place(fork, q0); fork.style.transform = '';
    // 往後一掄（蓄勢）
    anim(fork, [{ transform: 'none' }, { transform: 'rotate(-36deg) translate(-8px, 8px)' }], { duration: 220, easing: 'cubic-bezier(.3,0,.2,1)' }); fork._rot = -36;
    await wait(260);
    await fly(fork, { x: p.x, y: p.y - tk * 2 }, self ? 380 : 500, 'evil', { rot: FORK_DOWN + 360, lift: W() * (self ? 0.12 : 0.22), ease: 'cubic-bezier(.3,0,.4,1)', trail: { d: tk * 0.08, gap: tk * 0.13 } });
    fork._rot = FORK_DOWN;
    fork.style.transform = `rotate(${FORK_DOWN}deg) scale(1.08)`;
    await wait(120); // 頂點頓一下
    await moveTo(fork, { x: p.x, y: p.y - tk * 0.35 }, 110, { lift: 0, ease: 'cubic-bezier(.8,0,1,.4)' });
    sfx('stab'); sfx('thud');
    squash(tt, 1.3);
    burst(p.x, p.y - tk * 0.2, 'evil', { n: 24, R: tk * 1.5, big: 1.2, streak: 0.6 });
    ring(p.x, p.y, 'evil', tk * 1.3, 2.2); later(100, () => ring(p.x, p.y, 'evil', tk * 1.1, 1.7, 440));
    develop(blot(p.x, p.y + tk * 0.05, 'evil', tk * 1.25, 0.5), 360);
    anim(fork, [45, 52, 40, 48, 45].map(d => ({ transform: `rotate(${d}deg)` })), { duration: 480, easing: 'ease-out' });
    await wait(300);
    await seatStamp(ti, '攻擊', 'evil', { mark: '[data-act="imp"]' }); // 只演出手，選自己也不暗示傳位成了
    await finish();
  });

  // 僧侶：念珠從牌裏升起，飛到目標頭頂一散，一顆顆繞著目標轉，圍成一圈；圈合上，雙線護圈扣下，金色浮塵往上飄
  const monk = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti);
    wash(SELF_WASH); lift(me); const tt = lift(ti, true);
    await wait(320);
    const pr = await emerge('prayer-beads', 'good', me, { snd: 'shimmer' });
    wiggle(pr);
    await wait(300);
    await fly(pr, above(ti, 1.1), 540, 'brass', { rot: -10 });
    const c = posOf(pr);
    sfx('clip'); fade(pr, 140);
    const N = 12, Rr = tk * 0.78, bd = tk * 0.17, beads = [];
    for (let i = 0; i < N; i++) {
      const th = -Math.PI / 2 + i / N * TAU, b = put(h('i', { class: 'ab-bead' }), c.x, c.y, bd);
      const turn = th + Math.PI / 2 + Math.PI;
      anim(b, Array.from({ length: 11 }, (_, k) => {
        const t = k / 10, ang = -Math.PI / 2 + turn * t, rr = tk * 1.1 + (Rr - tk * 1.1) * t + Math.sin(t * Math.PI) * tk * 0.25;
        return { offset: t, transform: `translate(${p.x + Math.cos(ang) * rr - c.x}px, ${p.y + Math.sin(ang) * rr - c.y}px) scale(${0.6 + 0.4 * t})` };
      }), { duration: 560, delay: i * 35, easing: 'cubic-bezier(.3,0,.3,1)' });
      if (i % 3 === 0) later(i * 35 + 540, () => sfx('tick'));
      beads.push(b);
    }
    await wait(N * 35 + 560);
    // 圈合上：雙線護圈扣下，念珠一顆顆亮一下
    sfx('bell'); sfx('shimmer');
    const d = tk * 1.4, bw = Math.max(2, tk * 0.045);
    const dome = h('i', { class: 'ab-ring', style: { '--c': C.good, left: p.x - d / 2 + 'px', top: p.y - d / 2 + 'px', width: d + 'px', height: d + 'px', borderWidth: bw + 'px',
      boxShadow: `inset 0 0 0 ${bw}px ${C.paper}, inset 0 0 0 ${bw * 2}px ${C.good}` } });
    getStage().append(dome);
    anim(dome, [{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'scale(.94)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.3,.8,.4,1)' });
    ring(p.x, p.y, 'good', d, 1.8, 520); squash(tt, 0.4);
    beads.forEach((b, i) => anim(b, [{ scale: '1' }, { scale: '1.45' }, { scale: '1' }], { duration: 240, delay: i * 25, fill: 'none' }));
    motes(p.x, p.y, 'brass', { n: 12, R: tk * 0.8, ms: 1500 });
    await wait(420);
    await seatStamp(ti, '保護', 'good', { mark: '[data-act="monk"]' });
    await finish();
  });

  // 管家：鑰匙從牌裏升起，飛過去插進目標牌上浮出的鎖孔，一擰哢噠；一枚吊牌落下掛在牌上晃
  const butler = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti);
    wash(SELF_WASH); lift(me); const tt = lift(ti, true);
    await wait(320);
    const key = await emerge('key', 'brass', me, { size: tk * 1.0, snd: 'key' });
    wiggle(key);
    await wait(280);
    const hole = put(svgEl('0 0 100 100', KEYHOLE), p.x, p.y, tk * 0.46);
    develop(hole, 300); sfx('tock');
    // 鑰匙圖是匙齒朝上：轉 180° 才是往下插
    await fly(key, { x: p.x, y: p.y - tk * 0.95 }, 500, 'brass', { rot: 180 });
    await moveTo(key, { x: p.x, y: p.y - tk * 0.5 }, 140, { lift: 0, ease: 'cubic-bezier(.6,0,1,.6)' });
    sfx('clip'); squash(tt, 0.3);
    await wait(140);
    // 擰：壓扁成一條再翻過來，像轉了半圈
    anim(key, [{ transform: 'rotate(180deg) scaleX(1)' }, { transform: 'rotate(180deg) scaleX(.15)', offset: 0.5 }, { transform: 'rotate(180deg) scaleX(-1)' }], { duration: 280, easing: 'ease-in-out' });
    sfx('unlock');
    await wait(300);
    ring(p.x, p.y, 'brass', tk * 1.2, 1.8); flecks(p.x, p.y - tk * 0.2, { n: 7, tones: ['brass', 'paper'] });
    fade(key, 220); fade(hole, 220);
    await wait(200);
    // 吊牌落下，掛在牌上晃（吊牌的繩眼在右上角）
    const tag = put(sticker('price-tag', 'brass'), p.x + tk * 0.42, p.y + tk * 0.3, tk * 0.85);
    tag.style.transformOrigin = '78% 14%';
    anim(tag, [{ transform: `translateY(${-tk * 1.2}px) rotate(-30deg)`, opacity: 0 }, { transform: 'translateY(0) rotate(26deg)', opacity: 1, offset: 0.2 }, { transform: 'rotate(-16deg)', offset: 0.42 },
      { transform: 'rotate(9deg)', offset: 0.62 }, { transform: 'rotate(-4deg)', offset: 0.8 }, { transform: 'rotate(0)' }], { duration: 1200, easing: 'ease-out' });
    sfx('bell');
    await wait(360);
    await seatStamp(ti, '主人', 'brass', { mark: '[data-act="butler"]' });
    await finish();
  });

  // 占卜師選完兩人：水晶球從牌裏升起，兩枚小球拖著光點飛到選中的座位上（答案到了再演整段）
  const ftPick = scene(async (e, me) => {
    wash(SELF_WASH, 320); lift(me); e.to.forEach(id => lift(id, true));
    await wait(260);
    const ball = await emerge('crystal-ball', 'night', me, { size: tk * 0.95, snd: 'hum' });
    await wait(200);
    const b = posOf(ball);
    await Promise.all(e.to.map(async (id, k) => {
      await wait(k * 140);
      const c = put(chip('crystal-ball', 'night'), b.x, b.y - tk * 0.2, tk * 0.46);
      await fly(c, above(id, 0.62), 440, 'paper', { lift: tk * 0.8, trail: { d: tk * 0.05 } });
      const p = at(id);
      squash(tokOf(id), 0.5); ring(p.x, p.y, 'paper', tk * 1.1, 1.6, 420); motes(p.x, p.y, 'paper', { n: 5, R: tk * 0.4 });
    }));
    await wait(480);
    await finish(360);
  });
  // 守鴉人選完人：烏鴉從自己的牌裏飛出，撲著翅膀落到選中的人頭上，叫一聲
  const rkPick = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), m = at(me);
    wash(SELF_WASH, 320); lift(me); lift(ti, true);
    await wait(260);
    const rv = await emerge('crow-dive', 'ink', me, { size: tk * 1.0, snd: 'flap' });
    if (p.x > m.x) rv.firstChild.firstChild.style.transform = 'scaleX(-1)';
    const flap = anim(rv.firstChild, [{ scale: '1 1' }, { scale: '1 .7' }, { scale: '1 1' }], { duration: 240, iterations: Infinity, fill: 'none' });
    later(200, () => feathers(posOf(rv).x, posOf(rv).y, 2));
    await fly(rv, above(ti, 0.78), 640, 'paper', { lift: tk * 1.1, trail: { d: tk * 0.05, gap: tk * 0.22 } });
    flap?.cancel();
    const perch = put(sticker('raven', 'ink'), posOf(rv).x, posOf(rv).y, tk * 0.85);
    rv.remove();
    anim(perch, [{ transform: 'translateY(-6px) scale(1.1, .9)' }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
    sfx('caw'); squash(tokOf(ti), 0.5); feathers(p.x, p.y - tk * 0.7, 3);
    await wait(700);
    await finish(380);
  });

  // ———— 自己：收到信息。各角色一套戲，答案落在桌心停一會，再收進面板 ————
  // 洗衣婦：晾衣繩從一個座位甩到另一個座位，兩頭夾住；濕漉漉的角色牌晾上去，繩子一沉回彈，牌晃、滴水；取下來落到桌心
  const washerwoman = scene(async (e, me) => {
    const A = e.a, B = e.b;
    wash(SELF_WASH); lift(me); lift(A, true); lift(B, true);
    await wait(320);
    const pin = await emerge('clothespin', 'brass', me, { size: tk * 0.85, snd: 'clip' });
    await wait(220);
    const pa = above(A, 0.3), pb = above(B, 0.3), t0 = performance.now(), now = () => performance.now() - t0;
    const sv = svgEl(`0 0 ${innerWidth} ${innerHeight}`, `<polyline style="fill:none;stroke:${C.paper};stroke-width:${W() * 0.014 + 3}px;stroke-linecap:round"/>
      <polyline style="fill:none;stroke:${C.ink};stroke-width:${W() * 0.009}px;stroke-linecap:round"/>
      <polyline style="fill:none;stroke:${C.brass};stroke-width:${W() * 0.009}px;stroke-linecap:butt;stroke-dasharray:${W() * 0.006} ${W() * 0.01}"/>`, 'ab-line');
    getStage().append(sv);
    const R = { len: 0, sag: tk * 0.35, kick: 0, kickT: 0, dips: [], items: [] };
    const onRope = u => {
      const base = { x: pa.x + (pb.x - pa.x) * u, y: pa.y + (pb.y - pa.y) * u };
      return { x: base.x, y: base.y + R.sag * 4 * u * (1 - u) + R.dips.reduce((s, d) => s + d.a * Math.exp(-(((u - d.u) / 0.14) ** 2)), 0) };
    };
    const draw = () => {
      const t = now(), el = t - R.kickT;
      R.sag = tk * 0.35 + R.kick * Math.exp(-el / 200) * Math.cos(el / 38);
      for (const d of R.dips) { const k = t - d.t0; d.a = k < 0 ? 0 : d.A * Math.exp(-k / 180) * Math.cos(k / 34) + d.rest * (1 - Math.exp(-k / 90)); }
      const pts = [];
      for (let u = 0; u <= R.len + 0.001; u += 0.04) { const q = onRope(Math.min(u, R.len)); pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`); }
      sv.querySelectorAll('polyline').forEach(pl => pl.setAttribute('points', pts.join(' ')));
      for (const it of R.items) {
        if (!it.on) continue;
        const k = t - it.t0, q = onRope(it.u);
        place(it.el, { x: q.x, y: q.y + it.el.offsetHeight / 2 - tk * 0.12 });
        it.el.style.rotate = it.R * Math.exp(-k / 420) * Math.sin(k / 80) + 'deg';
      }
    };
    loop(sv, draw);
    // 繩子甩過去，衣夾一分為二夾住兩頭
    sfx('swish');
    const pin2 = put(sticker('clothespin', 'brass'), posOf(pin).x, posOf(pin).y, tk * 0.85);
    moveTo(pin, pa, 260, { lift: tk * 0.4 }); moveTo(pin2, pb, 260, { lift: tk * 0.4 });
    await tween(260, u => { R.len = 1 - (1 - u) ** 3; draw(); });
    R.kick = tk * 0.3; R.kickT = now();
    sfx('clip'); squash(tokOf(A), 0.4); squash(pin, 0.6); burst(pa.x, pa.y, 'brass', { n: 5, R: tk * 0.4, keep: false, big: 0.5 });
    await wait(70);
    sfx('clip'); squash(tokOf(B), 0.4); squash(pin2, 0.6); burst(pb.x, pb.y, 'brass', { n: 5, R: tk * 0.4, keep: false, big: 0.5 });
    await wait(160);
    // 濕牌落到繩子中間，水花四濺，繩子一沉、回彈，牌晃
    const md = onRope(0.5), tkn = put(roleToken(e.role), md.x, md.y + tk * 0.4, tk * 1.05);
    tkn.style.transformOrigin = '50% 10%';
    anim(tkn, [{ transform: `translateY(${-tk * 1.6}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.5,0,.9,.6)' });
    await wait(200);
    stop(tkn);
    R.items.push({ el: tkn, u: 0.5, on: true, t0: now(), R: 12 });
    R.dips.push({ u: 0.5, A: tk * 0.3, rest: tk * 0.12, t0: now(), a: 0 });
    sfx('splash');
    burst(md.x, md.y + tk * 0.5, 'paper', { n: 12, R: tk * 0.9, keep: false, big: 0.6 });
    ring(md.x, md.y + tk * 0.45, teamCol(e.role), tk * 1.2, 1.8, 440);
    const dry = dripping(tkn, 280);
    await wait(900);
    // 取下來，落到桌心
    R.items[0].on = false;
    sfx('clip');
    tkn.style.rotate = ''; tkn.style.transformOrigin = ''; // 晃的時候錨點在頂上；之後要縮放、飛到座位，錨點放回中心
    await moveTo(tkn, mid, 380, { lift: tk * 0.6, s1: 1.3 });
    sfx('stamp'); ring(mid.x, mid.y, teamCol(e.role), tk * 1.3, 2.1); squash(tkn, 0.5);
    burst(mid.x, mid.y + tk * 0.3, 'paper', { n: 8, R: tk * 0.8, keep: false, big: 0.5, dir: Math.PI / 2, spread: Math.PI });
    await hold([tkn], 'paper');
    dry();
    // 夾子彈開，繩子垂下去
    [pin, pin2].forEach((x, k) => anim(x, [{ transform: x.style.transform }, { transform: `translate(${(k ? 1 : -1) * tk * 0.3}px, ${-tk * 0.6}px) rotate(${(k ? 1 : -1) * 120}deg)`, opacity: 0 }], { duration: 420, easing: 'ease-out' }));
    R.kick = -tk * 0.8; R.kickT = now(); fade(sv, 420);
    await toSeats(tkn, [A, B], `[data-r="${e.role}"]`);
    await finish();
  });

  // 圖書管理員：合著的書飛到桌心，翻開，書頁一頁頁翻過（平著翻，不往鏡頭外甩）；角色牌從書裏立起來，兩條書籤絲帶飛出去夾在那兩人的座位上
  const librarian = scene(async (e, me) => {
    const none = e.none, seats = none ? [] : [e.a, e.b], S = tk * 1.4, c = { x: mid.x, y: mid.y + tk * 0.2 };
    wash(SELF_WASH); lift(me); seats.forEach(id => lift(id, true));
    await wait(320);
    const bk = await emerge('book-cover', 'brass', me, { size: tk, snd: 'tock' });
    await wait(160);
    const k = S / tk * 0.62;
    await fly(bk, c, 460, 'brass', { lift: tk * 0.8, s1: k });
    sfx('thud'); squash(bk, 0.6); impress('book-cover', 'brass', bk); puff(c.x, c.y + S * 0.3, 'paper', { n: 3, d: tk * 0.4, op: 0.3, rise: tk * 0.2 });
    await wait(300);
    // 翻開
    anim(bk, [{ transform: bk.style.transform }, { transform: `scale(0, ${k})` }], { duration: 140, easing: 'ease-in' });
    const open = put(sticker('open-book', 'brass'), c.x, c.y, S);
    open.style.transform = 'scaleX(0)';
    later(120, () => { open.style.transform = ''; sfx('page'); anim(open, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1.04)', offset: 0.7 }, { transform: 'none' }], { duration: 240, easing: 'ease-out' }); });
    await wait(380);
    // 書頁一頁頁翻過：繞書脊壓扁再翻到另一邊，全在桌面這個平面上
    const lw = S * 0.36, lh = S * 0.44;
    for (let i = 0; i < 4; i++) {
      const lf = h('i', { class: 'ab-leaf', style: { left: c.x + 'px', top: c.y - lh / 2 - S * 0.05 + 'px', width: lw + 'px', height: lh + 'px' } });
      getStage().append(lf);
      anim(lf, [{ transform: 'scaleX(1) skewY(0)', opacity: 1 }, { transform: 'scaleX(.15) skewY(-8deg)', opacity: 1, offset: 0.5 },
        { transform: 'scaleX(-.95) skewY(0)', opacity: 1, offset: 0.92 }, { transform: 'scaleX(-1)', opacity: 0 }], { duration: 300, delay: i * 95, easing: 'ease-in-out' });
      later(i * 95, () => sfx('leaf'));
    }
    later(220, () => flecks(c.x, c.y - S * 0.15, { n: 5, R: tk * 0.6 }));
    await wait(3 * 95 + 320);
    if (!none) {
      // 角色牌從書頁裏立起來（從底邊往上長，不翻向鏡頭）
      const tkn = put(roleToken(e.role), c.x, c.y - S * 0.42, tk * 1.2);
      tkn.style.transformOrigin = '50% 100%';
      anim(tkn, [{ transform: 'scale(.9, 0)', opacity: 0 }, { transform: 'scale(1, 1.08)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.3,1.2,.5,1)' });
      later(200, () => { sfx('stamp'); ring(c.x, c.y - S * 0.42, teamCol(e.role), tk * 1.3, 2); });
      await wait(420);
      tkn.style.transformOrigin = ''; // 立起來時錨點在底邊；之後要縮小飛到座位，錨點放回中心
      // 兩條書籤絲帶飛出去，夾在那兩人的座位底下
      sfx('swish');
      await Promise.all(seats.map(async (id, n) => {
        await wait(n * 90);
        const p = at(id), rb = put(svgEl('0 0 100 100', RIBBON), c.x, c.y - S * 0.1, tk * 0.7, tk * 0.7, 'under');
        await fly(rb, { x: p.x + tk * 0.22, y: p.y + tk * 0.48 }, 460, 'brass', { lift: tk, rot: rand(-14, 14), trail: { d: tk * 0.05 } });
        sfx('tock'); squash(tokOf(id), 0.4); ring(p.x, p.y, 'brass', tk * 1.1, 1.5, 400);
      }));
      await hold([tkn], 'brass');
      anim(open, [{ transform: 'none' }, { transform: 'scaleX(0)', opacity: 0.6 }], { duration: 240, easing: 'ease-in' }); sfx('page');
      await toSeats(tkn, seats, `[data-r="${e.role}"]`);
    } else {
      // 沒有外來者：攤開的書是空的，揚起一陣灰
      puff(c.x, c.y - S * 0.1, 'gray', { n: 4, d: tk * 0.55, op: 0.4, rise: tk * 0.5, ms: 1100 });
      const st = await spotStamp({ x: c.x, y: c.y + S * 0.5 }, '沒有', 'gray', { soft: true, fs: Math.max(20, tk * 0.5) });
      await hold([st.parentElement], 'gray');
      anim(open, [{ transform: 'none' }, { transform: 'scaleX(0)', opacity: 0.6 }], { duration: 240, easing: 'ease-in' }); sfx('page');
      await toHud([st.parentElement]);
    }
    await finish();
  });

  // 調查員：放大鏡飛到桌心；兩串腳印從那兩人的座位一步步走向鏡子；鏡片裏按網點顯影出爪牙的牌
  const investigator = scene(async (e, me) => {
    const seats = e.none ? [] : [e.a, e.b], c = { x: mid.x, y: mid.y + tk * 0.05 }, S = tk * 2.3;
    wash(SELF_WASH); lift(me); seats.forEach(id => lift(id, true));
    await wait(320);
    const mg = await emerge('magnifying-glass', 'brass', me, { size: tk * 1.1, snd: 'tock' });
    await wait(160);
    const lc = { x: c.x + (0.5 - LENS.x) * S, y: c.y + (0.5 - LENS.y) * S };
    await fly(mg, lc, 480, 'brass', { lift: tk * 0.8, s1: S / (tk * 1.1) });
    sfx('tock'); ring(c.x, c.y, 'brass', tk * 1.5, 1.6, 460);
    // 兩串腳印走過來
    await Promise.all(seats.map(id => walk(inward(id, 0.7), c, tk * 0.95)));
    if (!e.role) {
      // 說書人給了「沒有」：鏡片裏空空的，揚一陣灰
      puff(c.x, c.y, 'gray', { n: 4, d: tk * 0.6, op: 0.4, rise: tk * 0.5 });
      const st = await spotStamp({ x: c.x, y: c.y + tk * 1.1 }, '沒有', 'gray', { soft: true, fs: Math.max(20, tk * 0.5) });
      await hold([st.parentElement, mg], 'gray');
      fade(mg, 300);
      await toHud([st.parentElement]);
      return finish();
    }
    // 鏡片裏顯影
    const tkn = put(roleToken(e.role), c.x, c.y, tk * 1.05, tk * 1.05, '', mg);
    sfx('hum');
    anim(mg, [{ rotate: '0deg' }, { rotate: '-6deg' }, { rotate: '4deg' }, { rotate: '0deg' }], { duration: 560, fill: 'none' });
    develop(tkn, 560);
    await wait(540);
    sfx('stamp'); ring(c.x, c.y, teamCol(e.role), tk * 1.3, 2); squash(tkn, 0.3);
    await hold([tkn, mg], 'brass');
    fade(mg, 300);
    await toSeats(tkn, seats, `[data-r="${e.role}"]`);
    await finish();
  });
  // 一串腳印從 a 走向 b（停在 b 前面 stopShort），左右腳交替
  async function walk(a, b, stopShort = 0, tone = 'brass') {
    const dx = b.x - a.x, dy = b.y - a.y, D = Math.hypot(dx, dy) || 1, ux = dx / D, uy = dy / D, deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    const step = tk * 0.3, n = Math.max(3, Math.floor((D - stopShort) / step));
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1, d = i * step + step * 0.5, x = a.x + ux * d - uy * s * tk * 0.09, y = a.y + uy * d + ux * s * tk * 0.09;
      const fp = put(flat('footprint', tone), x, y, tk * 0.28, tk * 0.28, 'under');
      fp.style.transform = `rotate(${deg}deg) scaleX(${s})`;
      anim(fp, [{ opacity: 0, scale: '1.6' }, { opacity: 0.95, scale: '1' }], { duration: 130, easing: 'ease-out' });
      later(700, () => anim(fp, [{ opacity: 0.95 }, { opacity: 0.45 }], { duration: 700 }));
      if (i % 2 === 0) sfx('tick');
      await wait(80);
    }
  }

  // 廚師：廚師的頭像從自己的牌裏探出來，沿桌挨個嗅過每一對鄰座（每處都一樣，不洩露哪一對）；回到桌心深吸一口，
  // 有幾對邪惡就有幾對紅色的氣味從四面八方（不是從座位）鑽進鼻子，一對一聲；沒有就搖搖頭。數字章蓋在下面
  const chef = scene(async (e, me) => {
    const n = e.n | 0, tone = n ? 'evil' : 'good', all = [...document.querySelectorAll('.seat[data-key]')].map(x => x.dataset.key);
    wash(SELF_WASH); lift(me);
    await wait(320);
    const m = at(me), head = put(roleToken('chef'), m.x, m.y, tk * 0.7);
    anim(head, [{ transform: 'scale(.3)', opacity: 0 }, { transform: `translateY(${-tk * 0.6}px) scale(1.12)`, opacity: 1, offset: 0.6 }, { transform: `translateY(${-tk * 0.45}px)`, opacity: 1 }],
      { duration: 420, easing: 'cubic-bezier(.3,.8,.4,1)' });
    motes(m.x, m.y, 'paper', { n: 5, R: tk * 0.4 });
    await wait(420);
    stop(head); place(head, { x: m.x, y: m.y - tk * 0.45 });
    // 沿桌嗅一圈：停在每兩個鄰座之間（往桌心收一點）
    const N = all.length, k0 = Math.max(0, all.indexOf(me)), per = Math.max(170, Math.min(280, 2600 / Math.max(1, N)));
    for (let i = 0; i < N; i++) {
      const a = at(all[(k0 + i) % N]), b = at(all[(k0 + i + 1) % N]), g = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dx = mid.x - g.x, dy = mid.y - g.y, L = Math.hypot(dx, dy) || 1, q = { x: g.x + dx / L * tk * 0.75, y: g.y + dy / L * tk * 0.75 };
      await moveTo(head, q, per * 0.5, { lift: tk * 0.22 });
      sniff(head, [a, b]);
      await wait(per * 0.5);
    }
    // 回到桌心，深吸一口
    await moveTo(head, { x: mid.x, y: mid.y - tk * 0.15 }, 380, { lift: tk * 0.5, s1: 2 });
    ring(mid.x, mid.y - tk * 0.15, 'paper', tk * 1.5, 1.6, 460);
    await wait(200);
    const nose = { x: mid.x, y: mid.y - tk * 0.15 };
    if (n) {
      // 一對一對地聞進來：每對兩縷紅色的氣味，方向隨機（不是從座位來）
      for (let i = 0; i < n; i++) {
        const a0 = rand(0, TAU);
        for (const d of [0, 0.45]) {
          const a = a0 + d, from = { x: nose.x + Math.cos(a) * tk * 2.1, y: nose.y + Math.sin(a) * tk * 1.6 };
          scent(from, nose, 'evil', { w: tk * 0.75, ms: 640 });
        }
        later(600, () => { sfx('sniff'); squash(head, 0.5); ring(nose.x, nose.y, 'evil', tk * 1.3, 1.7, 420); });
        await wait(700);
      }
    } else {
      sfx('sniff'); squash(head, 0.4);
      await wait(260);
      anim(head, [0, -14, 12, -8, 0].map(d => ({ rotate: d + 'deg' })), { duration: 460, easing: 'ease-out', fill: 'none' });
      puff(nose.x, nose.y + tk * 0.4, 'gray', { n: 2, d: tk * 0.4, op: 0.35, rise: tk * 0.3 });
      await wait(460);
    }
    const st = await spotStamp({ x: mid.x, y: mid.y + tk * 1.05 }, `${n} 對`, tone, { fs: Math.max(20, tk * 0.5) });
    await hold([head, st.parentElement], tone === 'evil' ? 'evil' : 'paper');
    fade(head, 300);
    await toHud([st.parentElement]);
    await finish();
  });
  // 嗅一下：頭像抽兩下鼻子，兩個座位各飄來一縷紙色的氣味（兩邊都一樣）
  function sniff(head, pair) {
    sfx('sniff', 0.5);
    anim(head, [{ scale: '1' }, { scale: '1.08 .93' }, { scale: '1' }, { scale: '1.06 .95' }, { scale: '1' }], { duration: 260, fill: 'none' });
    const c = posOf(head);
    pair.forEach(p => scent({ x: c.x + (p.x - c.x) * 0.7, y: c.y + (p.y - c.y) * 0.7 }, c, 'paper', { w: tk * 0.4, ms: 320 }));
  }
  // 一縷氣味：漫畫裏的波浪線，一邊畫出來一邊扭著飄向 b，越飄越小、淡掉
  function scent(a, b, tone, { w = tk * 0.6, ms = 600, delay = 0 } = {}) {
    const d = 'M6 20Q17 4 28 20T50 20T72 20T94 20', deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const el = put(svgEl('0 0 100 40', `<path d="${d}" style="fill:none;stroke:${C.paper};stroke-width:13;stroke-linecap:round"/><path d="${d}" style="fill:none;stroke:${col(tone)};stroke-width:7;stroke-linecap:round"/>`), a.x, a.y, w, w * 0.4);
    el.style.opacity = 0;
    el.querySelectorAll('path').forEach(p => { p.style.strokeDasharray = 130; anim(p, [{ strokeDashoffset: 130 }, { strokeDashoffset: 0 }], { duration: ms * 0.45, delay, easing: 'ease-out' }); });
    anim(el, Array.from({ length: 9 }, (_, k) => {
      const t = k / 8, sway = Math.sin(t * Math.PI * 2) * w * 0.12;
      return { offset: t, opacity: t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1,
        transform: `translate(${(b.x - a.x) * t}px, ${(b.y - a.y) * t + sway}px) rotate(${deg}deg) scale(${1 - 0.55 * t})` };
    }), { duration: ms, delay, easing: 'cubic-bezier(.4,0,.7,1)' });
  }

  // 共情者：聽診器從牌裏升起，挨個貼到兩個鄰座上聽心跳（撲通撲通，牌跟著跳，不帶顏色）；回到桌心，心電圖砸下，數字跟著心跳
  const empath = scene(async (e, me) => {
    const nb = (e.ids || []).filter(id => id !== me), n = e.n | 0, tone = n ? 'evil' : 'good', c = { x: mid.x, y: mid.y - tk * 0.1 };
    wash(SELF_WASH); lift(me); nb.forEach(id => lift(id, true));
    await wait(320);
    const sc = await emerge('stethoscope', 'brass', me, { size: tk * 1.05, snd: 'tock' });
    await wait(160);
    for (const id of nb) {
      await fly(sc, inward(id, 0.6), 380, 'brass', { lift: tk * 0.5, rot: rand(-14, 14), trail: { d: tk * 0.05 } });
      squash(sc, 0.4); sfx('tock');
      await wait(80);
      await heartbeat(id);
      await wait(140);
    }
    await fly(sc, { x: c.x - tk * 1.05, y: c.y - tk * 0.25 }, 400, 'brass', { lift: tk * 0.6, rot: -16, trail: { d: tk * 0.05 } });
    const hb = put(sticker('heart-beats', tone), c.x, c.y, tk * 1.3);
    beat(hb, 'beat2'); ring(c.x, c.y, tone, tk * 1.4, 2);
    await wait(260);
    const st = await spotStamp({ x: c.x, y: c.y + tk * 0.95 }, `${n}`, tone, { fs: Math.max(24, tk * 0.62) });
    // 停住的時候再跳兩下
    for (const ms of [380, 1100]) later(ms, () => { sfx('beat2'); anim(hb, [{ scale: '1' }, { scale: '1.14' }, { scale: '1' }, { scale: '1.07' }, { scale: '1' }], { duration: 420, fill: 'none' }); ring(c.x, c.y, tone, tk * 1.3, 1.8, 480); });
    await hold([hb, st.parentElement], tone);
    fade(sc, 300);
    await toHud([hb, st.parentElement]);
    await finish();
  });

  // 占卜師：答案從被查的兩人身上回來，最後也落回那兩人身邊——兩人頭上各浮起一顆小水晶球（兩顆一模一樣，不洩露誰是惡魔），球裏墨色翻湧、冒煙；
  // 兩顆球飛到桌心合成一顆大球，墨收成一點，網點顯影出 ✓ / ✗，蓋章
  const ftInfo = scene(async (e, me) => {
    const seats = (e.ids || []).filter(id => id !== me), yes = !!e.yes, tone = yes ? 'evil' : 'good';
    wash(SELF_WASH); lift(me); seats.forEach(id => lift(id, true));
    await wait(320);
    const bs = tk * 1.75, spot = { x: mid.x, y: mid.y - tk * 0.2 }, sb = tk * 0.85;
    const swirlOf = () => h('div', { class: 'ab-in', style: { left: '22%', top: '6%', width: '56%', height: '56%', opacity: 0 } }, flat('ink-swirl', 'paper'));
    // 被查的人頭上各浮起一顆小球
    const smalls = (seats.length ? seats : [null]).map(id => {
      const p = id ? at(id) : spot, q = id ? above(id, 0.85) : spot, sw = swirlOf();
      const b = put(h('div', { class: 'ab-box' }, sticker('crystal-ball', 'night'), sw), p.x, p.y, sb);
      anim(b, [{ transform: 'scale(.2)', opacity: 0 }, { transform: `translateY(${q.y - p.y - tk * 0.15}px) scale(1.1)`, opacity: 1, offset: 0.6 }, { transform: `translateY(${q.y - p.y}px)`, opacity: 1 }],
        { duration: 460, easing: 'cubic-bezier(.3,.8,.4,1)' });
      if (id) { squash(tokOf(id), 0.5); motes(p.x, p.y, 'paper', { n: 5, R: tk * 0.4 }); }
      return { b, sw, q };
    });
    sfx('hum');
    await wait(460);
    smalls.forEach(s => { stop(s.b); place(s.b, s.q); });
    // 球裏墨色翻湧、冒煙
    smalls.forEach(({ b, sw, q }) => {
      sw.style.opacity = 1;
      anim(sw, [{ transform: 'rotate(0) scale(.3)', opacity: 0 }, { transform: 'rotate(300deg) scale(1)', opacity: 0.95, offset: 0.3 }, { transform: 'rotate(900deg) scale(1)', opacity: 0.95 }], { duration: 700, easing: 'ease-in' });
      anim(b.firstChild, Array.from({ length: 11 }, (_, i) => ({ transform: i === 10 ? 'none' : `translate(${(Math.random() - 0.5) * 2 * (i / 10) * 4}px, ${(Math.random() - 0.5) * 2 * (i / 10) * 2}px)` })), { duration: 700, fill: 'none' });
      puff(q.x, q.y - sb * 0.3, 'paper', { n: 2, d: tk * 0.3, op: 0.35, rise: tk * 0.4, delay: 200 });
    });
    await wait(720);
    // 兩顆球飛到桌心，合成一顆大球
    sfx('whoosh', 0.6);
    await Promise.all(smalls.map(({ b }, k) => (async () => {
      await wait(k * 80);
      await fly(b, spot, 460, 'paper', { lift: tk * 0.7, s1: 1.25, trail: { d: tk * 0.05 } });
      b.remove();
    })()));
    const swirl = swirlOf();
    const disc = () => h('div', { class: 'ab-disc', style: { borderColor: col(tone), color: col(tone) } }, roleIcon('imp'),
      h('div', { class: 'ab-badge', style: { background: col(tone) } }, icon(yes ? 'check' : 'cross')));
    const ans = h('div', { class: 'ab-in', style: { left: '27%', top: '10%', width: '46%', height: '46%', opacity: 0 } }, disc());
    const box = put(h('div', { class: 'ab-box' }, sticker('crystal-ball', 'night'), swirl, ans), spot.x, spot.y, bs);
    ring(spot.x, spot.y, 'paper', bs * 1.1, 1.6, 460);
    anim(box, [{ transform: 'scale(.7)' }, { transform: 'scale(1.06)', offset: 0.6 }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
    swirl.style.opacity = 1;
    anim(swirl, [{ transform: 'rotate(0) scale(1)', opacity: 0.95 }, { transform: 'rotate(600deg) scale(1)', opacity: 0.95, offset: 0.7 }, { transform: 'rotate(800deg) scale(0)', opacity: 0 }], { duration: 620, easing: 'ease-in' });
    await wait(600);
    ans.style.opacity = 1;
    develop(ans, 320); sfx('tag');
    const a = cen(ans); ring(a.x, a.y, tone, a.w * 1.4, 2.2, 460); burst(a.x, a.y, tone, { n: 10, R: bs * 0.5, keep: false, big: 0.6 });
    await wait(260);
    const st = await spotStamp({ x: mid.x, y: mid.y + tk * 0.95 }, yes ? '有惡魔' : '沒有惡魔', tone, {});
    await hold([box, st.parentElement], 'paper');
    if (seats.length) {
      // 球裏的答案浮出來，一分為二落到被查的兩人身邊；球和章淡掉
      const r = cen(ans), out = put(h('div', { class: 'ab-box' }, disc()), r.x, r.y, r.w);
      ans.style.opacity = 0; fade(box, 360); fade(st.parentElement, 300);
      await toSeats(out, seats, '[data-demon]');
    } else await toHud([box, st.parentElement]);
    await finish();
  });

  // 送葬者：鏟子飛到桌心挖三下，土塊四濺、坑越挖越大；被處決的人的牌魂飄進坑裏；墓碑從坑裏升起，碑面上顯影出他的角色；停一會，牌落回那個人身邊
  const undertaker = scene(async (e, me) => {
    const dead = e.id && e.id !== me ? e.id : null, c = { x: mid.x, y: mid.y + tk * 0.45 };
    wash(SELF_WASH); lift(me); const dt = dead && lift(dead, true);
    await wait(320);
    const sp = await emerge('trench-spade', 'brass', me, { size: tk * 1.15, snd: 'tock' });
    await wait(140);
    // 鏟子圖是鏟頭朝右上：轉 180° 才是鏟頭朝下
    await fly(sp, { x: c.x + tk * 0.35, y: c.y - tk * 0.95 }, 440, 'brass', { rot: 160, lift: tk * 0.7 });
    const hole = put(h('i', { class: 'ab-hole' }), c.x, c.y, tk * 1.5, tk * 0.5, 'under');
    hole.style.scale = '0';
    for (let i = 0; i < 3; i++) {
      await moveTo(sp, { x: c.x + tk * 0.18, y: c.y - tk * 0.4 }, 110, { rot: 188, lift: 0, ease: 'cubic-bezier(.7,0,1,.5)' });
      sfx('dig'); clods(c.x, c.y, { n: 7, side: i % 2 ? 1 : -1 });
      anim(hole, [{ scale: `${i / 3}` }, { scale: `${(i + 1) / 3}` }], { duration: 180, easing: 'ease-out' });
      await moveTo(sp, { x: c.x + tk * 0.4, y: c.y - tk * 1.0 }, 210, { rot: 148, lift: tk * 0.15 });
    }
    hole.style.scale = '1';
    // 牌魂飄進坑裏
    if (dt) {
      const p = at(dead), gh = put(dt.firstChild.cloneNode(true), p.x, p.y, tk);
      gh.style.opacity = 0.5;
      sfx('whoosh', 0.6);
      await moveTo(gh, { x: c.x, y: c.y - tk * 0.15 }, 520, { lift: tk * 0.6, s1: 0.5 });
      anim(gh, [{ opacity: 0.5, translate: '0 0' }, { opacity: 0, translate: `0 ${tk * 0.2}px` }], { duration: 220, easing: 'ease-in' });
      puff(c.x, c.y - tk * 0.1, 'paper', { n: 3, d: tk * 0.4, op: 0.35, rise: tk * 0.3 });
    }
    moveTo(sp, { x: c.x + tk * 1.35, y: c.y - tk * 0.5 }, 280, { rot: 196 });
    // 墓碑從坑裏升起（地面以下的部分剪掉）
    const S = tk * 1.95, rise = h('div', { class: 'ab-rise' }, sticker('tombstone', 'gray'));
    const stone = put(rise, c.x, c.y - S / 2 + tk * 0.08, S, S);
    anim(rise.firstChild, [{ transform: 'translateY(100%)' }, { transform: 'translateY(-4%)', offset: 0.8 }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.3,.8,.4,1)' });
    sfx('rumble'); later(150, () => clods(c.x, c.y, { n: 6 }));
    await wait(560);
    sfx('thud'); squash(stone, 0.3);
    const tkn = put(roleToken(e.role), c.x, c.y - S * 0.52, tk * 1.12);
    develop(tkn, 480);
    later(420, () => { sfx('stamp'); ring(c.x, c.y - S * 0.52, teamCol(e.role), tk * 1.2, 2); });
    await wait(520);
    await hold([tkn], 'paper');
    anim(rise.firstChild, [{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 420, delay: 200, easing: 'ease-in' });
    await toSeat(tkn, dead, 0, `[data-r="${e.role}"]`);
    await finish();
  });

  // 守鴉人：烏鴉落在選中的人牌上啄兩下，叫一聲，叼起他的角色牌飛到桌心丟下，停在牌邊上；停一會，牌落回那個人身邊
  const rkInfo = scene(async (e, me) => {
    const tg = e.id && e.id !== me ? e.id : null, p = at(tg || me), c = { x: mid.x, y: mid.y + tk * 0.15 };
    wash(SELF_WASH); lift(me); if (tg) lift(tg, true);
    await wait(320);
    const rv = put(sticker('raven', 'ink'), p.x + tk * 0.1, p.y - tk * 0.75, tk * 0.95);
    anim(rv, [{ transform: `translate(${-tk * 0.8}px, ${-tk * 1.2}px) scale(.6)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.3,.8,.4,1)' });
    sfx('flap'); later(200, () => feathers(p.x, p.y - tk * 0.6, 2));
    await wait(420);
    for (let k = 0; k < 2; k++) {
      anim(rv, [{ rotate: '0deg' }, { rotate: '-22deg' }, { rotate: '0deg' }], { duration: 170, fill: 'none' });
      later(85, () => { sfx('tock'); squash(tokOf(tg), 0.3); });
      await wait(230);
    }
    sfx('caw');
    await wait(220);
    // 叼起答案飛到桌心
    const tkn = put(roleToken(e.role), p.x, p.y + tk * 0.05, tk * 0.75);
    develop(tkn, 260);
    const flap = anim(rv.firstChild, [{ scale: '1 1' }, { scale: '1 .7' }, { scale: '1 1' }], { duration: 240, iterations: Infinity, fill: 'none' });
    sfx('flap');
    later(240, () => feathers(posOf(rv).x, posOf(rv).y, 2));
    trail(rv, 'paper', { d: tk * 0.05, gap: tk * 0.22 });
    await Promise.all([moveTo(rv, { x: c.x + tk * 0.1, y: c.y - tk * 1.05 }, 660, { lift: tk * 0.9 }), moveTo(tkn, c, 660, { lift: tk * 0.9, s1: 1.75 })]);
    rv._trail = false;
    sfx('stamp'); ring(c.x, c.y, teamCol(e.role), tk * 1.3, 2.1); squash(tkn, 0.5); feathers(c.x, c.y - tk * 0.6, 3);
    await moveTo(rv, { x: c.x + tk * 0.8, y: c.y - tk * 0.9 }, 220, { lift: tk * 0.2 });
    flap?.cancel();
    sfx('caw');
    await hold([tkn, rv], 'paper');
    // 烏鴉叼著牌送回那個人身邊
    const flap2 = anim(rv.firstChild, [{ scale: '1 1' }, { scale: '1 .7' }, { scale: '1 1' }], { duration: 240, iterations: Infinity, fill: 'none' });
    sfx('flap'); fade(rv, 520);
    moveTo(rv, { x: posOf(rv).x + tk * 0.6, y: posOf(rv).y - tk * 1.4 }, 520, { lift: tk * 0.3 });
    await toSeat(tkn, tg, 0, `[data-r="${e.role}"]`);
    flap2?.cancel();
    await finish();
  });

  // 間諜：望遠鏡沿桌轉一圈，經過的每個座位頭上按網點顯影出他的真角色；轉回桌心，魔典合上，蓋「過目」；看到的牌各自落到座位旁邊
  const spy = scene(async (e, me) => {
    const roles = Object.fromEntries(e.grim || []), all = [...document.querySelectorAll('.seat[data-key]')].map(x => x.dataset.key);
    wash(SELF_WASH); lift(me);
    await wait(320);
    const gl = await emerge('spyglass', 'evil', me, { size: tk, snd: 'swish' });
    await wait(140);
    const k0 = Math.max(0, all.indexOf(me)), per = Math.min(150, 1500 / Math.max(1, all.length)), minis = [];
    trail(gl, 'evil', { d: tk * 0.05, gap: tk * 0.2 });
    for (let n = 1; n < all.length; n++) {
      const id = all[(k0 + n) % all.length], p = at(id);
      await moveTo(gl, inward(id, 0.85), per, { lift: tk * 0.15 });
      if (roles[id]) {
        const m = put(roleToken(roles[id]), p.x + tk * 0.42, p.y - tk * 0.42, tk * 0.6);
        develop(m, 240); sfx('tick'); minis.push([m, id]);
      }
    }
    gl._trail = false;
    await moveTo(gl, { x: mid.x - tk * 1.1, y: mid.y - tk * 0.3 }, 320, { lift: tk * 0.4, rot: -14 });
    const bk = put(sticker('evil-book', 'evil'), mid.x, mid.y - tk * 0.1, tk * 1.45);
    beat(bk, 'thud'); later(230, () => impress('evil-book', 'evil', bk)); puff(mid.x, mid.y + tk * 0.4, 'paper', { n: 3, op: 0.3, d: tk * 0.5, rise: tk * 0.2 });
    await wait(260);
    const st = await spotStamp({ x: mid.x, y: mid.y + tk * 0.95 }, '過目', 'evil', {});
    await hold([bk, st.parentElement], 'evil');
    // 看到的每張牌落到各自的座位旁邊；魔典和章淡掉
    fade(gl, 260); fade(bk, 360); fade(st.parentElement, 300);
    await Promise.all(minis.map(([m, id], i) => { m.classList.remove('ab-dev'); return toSeat(m, id, i * 60, `[data-r="${roles[id]}"]`); }));
    await finish();
  });

  // ———— 自己：接任惡魔（紅唇女郎的飛吻 / 小惡魔傳過來的草叉）；惡魔的力量化作紅霧流過來，新的惡魔牌在桌心浮現，再飛回自己的座位翻面 ————
  const demon = scene(async (e, me) => {
    const from = e.from && e.from !== me ? e.from : null, m = at(me), c = { x: mid.x, y: mid.y - tk * 0.1 };
    wash(EVIL_WASH);
    const self = lift(me, false, e.was || null);
    await wait(320);
    if (from) {
      const p = at(from), dt = lift(from, true);
      if (e.why === 'fanggu') await DEMON.fanggu?.(p, me, dt);
      else if (e.why === 'scarletwoman') {
        // 飛吻：紅唇一嘟，輕飄飄蕩過去，一路飄著小愛心，在惡魔牌上留下唇印
        const lips = await emerge('lips', 'evil', me, { size: tk * 1.05 });
        anim(lips, [{ scale: '1' }, { scale: '.78 1.2', offset: 0.55 }, { scale: '1.12' }, { scale: '1' }], { duration: 300, easing: 'ease-out', fill: 'none' });
        await wait(260);
        const q0 = posOf(lips);
        [0.2, 0.4, 0.6, 0.8].forEach((k, n) => later(80 + n * 110, () => {
          const q = { x: q0.x + (p.x - q0.x) * k, y: q0.y + (p.y - q0.y) * k - tk * 1.0 * Math.sin(Math.PI * k) };
          const hh = put(sticker('hearts', 'evil'), q.x, q.y, tk * rand(0.28, 0.38));
          anim(hh, [{ transform: 'scale(.2)', opacity: 0 }, { transform: `translateY(${-tk * 0.1}px) scale(1)`, opacity: 1, offset: 0.3 }, { transform: `translate(${rand(-8, 8)}px, ${-tk * 0.4}px) scale(.7)`, opacity: 0 }], { duration: 760 });
        }));
        await moveTo(lips, { x: p.x, y: p.y - tk * 0.05 }, 560, { lift: tk * 1.0, s1: 0.62, rot: -12, ease: 'cubic-bezier(.35,0,.45,1)' });
        sfx('smack'); lips.remove();
        const print = put(sticker('lips', 'evil'), p.x, p.y, tk * 0.62);
        anim(print, [{ transform: 'scale(1.5) rotate(-12deg)', opacity: 0 }, { transform: 'scale(.92) rotate(-12deg)', opacity: 1, offset: 0.6 }, { transform: 'rotate(-12deg)', opacity: 1 }], { duration: 200, easing: 'ease-out' });
        for (let k = 0; k < 5; k++) {
          const hh = put(sticker('hearts', 'evil'), p.x, p.y, tk * 0.26), a = -Math.PI / 2 + (k - 2) * 0.55;
          anim(hh, [{ transform: 'scale(.3)', opacity: 1 }, { transform: `translate(${Math.cos(a) * tk * 0.8}px, ${Math.sin(a) * tk * 0.8}px) scale(1)`, opacity: 0 }], { duration: 640, easing: 'cubic-bezier(.2,.7,.4,1)' });
        }
      } else {
        // 傳位：死去的惡魔牌上竄起火苗，草叉升起，調頭飛過來，插在自己面前
        flames(p.x, p.y, { n: 5, R: tk * 0.45 }); sfx('fire');
        const fork = put(sticker('pitchfork', 'evil'), p.x, p.y, tk * 1.1);
        anim(fork, [{ transform: `translateY(${tk * 0.3}px) scale(.3)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.3,1.3,.5,1)' });
        sfx('demon'); await wait(340);
        const q = inward(me, 0.95);
        await fly(fork, { x: q.x, y: q.y - tk * 0.4 }, 500, 'evil', { rot: FORK_DOWN + 360, lift: tk * 1.2, trail: { d: tk * 0.07 } });
        sfx('stab'); burst(q.x, q.y, 'evil', { n: 10, R: tk * 0.7, big: 0.8 });
        anim(fork, [45, 52, 40, 48, 45].map(d => ({ transform: `rotate(${d}deg)` })), { duration: 440, easing: 'ease-out' });
      }
      squash(dt, 0.6); anim(dt, [{ filter: 'none' }, { filter: 'grayscale(1) brightness(.7)' }], { duration: 360, delay: 120 });
      await wait(300);
      // 惡魔的力量化作紅霧，從他身上流向自己
      wisp(p, m, 'evil', { n: 9, d: tk * 0.42, op: 0.65, ms: 720 }); sfx('demon');
      await wait(780);
      squash(self, 0.8); flames(m.x, m.y, { n: 6 }); sfx('fire');
      await wait(260);
    } else {
      flames(m.x, m.y, { n: 6 }); sfx('demon');
      await wait(420);
    }
    // 新的惡魔牌在桌心浮現
    const big = put(roleToken(e.role), c.x, c.y, tk * 1.35);
    develop(big, 500); flames(c.x, c.y, { n: 8, R: tk * 0.75, d: tk * 0.5 });
    later(440, () => { sfx('stamp'); ring(c.x, c.y, 'evil', tk * 1.6, 2.2); burst(c.x, c.y, 'evil', { n: 14, R: tk * 1.3, keep: false }); });
    await wait(560);
    const st = await spotStamp({ x: c.x, y: c.y + tk * 1.05 }, '接任', 'evil');
    await hold([big, st.parentElement], 'evil');
    // 牌飛回自己的座位，翻面
    fade(st.parentElement, 220);
    await moveTo(big, m, 440, { lift: tk * 0.8, s1: 1 / 1.35 });
    big.remove();
    await flipTo(self, e.role); ring(m.x, m.y, 'evil', tk * 1.4, 2.2); burst(m.x, m.y, 'evil', { n: 10, R: tk * 0.9, keep: false });
    await wait(500);
    await finish();
  });

  // ———— 全桌（擋操作）：聖徒被處決落敗、鎮長獲勝 ————
  const saint = scene(async e => {
    const id = e.seat, p = at(id);
    wash(PUB_WASH);
    const a = lift(id);
    await wait(260);
    const top = above(id, 0.78), halo = put(sticker('spiked-halo', 'brass'), top.x, top.y, tk * 0.95);
    halo.style.opacity = 0;
    anim(halo, [{ transform: `translateY(${-tk * 0.6}px) scale(.8)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.3,.8,.4,1)' });
    sfx('shimmer'); motes(top.x, top.y, 'brass', { n: 8, R: tk * 0.5 });
    await wait(620);
    anim(halo, [-3, 3, -2, 2, 0].map(d => ({ transform: `translateX(${d}px)` })), { duration: 200 }); sfx('crack');
    await wait(220);
    sfx('crack');
    const r = cen(halo); halo.remove(); halves(sticker('spiked-halo', 'brass'), r.x, r.y, r.w);
    flecks(r.x, r.y, { n: 9, R: tk, tones: ['brass', 'paper'] }); burst(r.x, r.y, 'brass', { n: 8, R: tk * 0.8, keep: false, big: 0.6 });
    squash(a, 0.6); anim(a, [{ filter: 'none' }, { filter: 'grayscale(1) brightness(.8)' }], { duration: 500, delay: 100 });
    await wait(320);
    await seatStamp(id, '落敗', 'evil', { hold: 800 });
    ring(p.x, p.y, 'evil', tk * 1.2, 1.6, 400);
    await finish();
  });
  const mayor = scene(async e => {
    const id = e.seat, p = at(id);
    wash(PUB_WASH);
    const a = lift(id);
    await wait(260);
    const top = above(id, 0.95), medal = put(sticker('ribbon-medal', 'brass'), top.x, top.y, tk * 0.95);
    beat(medal); motes(top.x, top.y, 'brass', { n: 6, R: tk * 0.4 });
    await wait(420);
    await moveTo(medal, { x: top.x, y: top.y + tk * 0.45 }, 150, { lift: 0, ease: 'cubic-bezier(.7,0,1,.5)' });
    sfx('bell'); squash(a, 0.5); ring(p.x, p.y, 'brass', tk * 1.3, 2.2);
    flecks(p.x, p.y - tk * 0.3, { n: 14, R: tk * 1.4, tones: ['paper', 'brass', 'good'] });
    await wait(320);
    await seatStamp(id, '鎮長獲勝', 'good', { hold: 800, fs: Math.max(18, tk * 0.36) });
    await finish();
  });

  // ———— 說書人魔典：一拍（1.2 秒以內，被動能力 2 秒以內），座位旁落一枚小紙簽 ————
  const look = src => ST[src] || (ACT_ICONS[src] && { prop: ACT_ICONS[src].ico, tone: ACT_ICONS[src].tone }) || { prop: 'to', tone: 'ink' };
  const stFly = scene(async (e, word, land) => {
    const sp = look(e.src), m = at(e.seat), tg = e.to || [];
    ring(m.x, m.y, 'brass', tk * 1.2, 1.4, 380);
    if (!tg.length) {
      const c = put(chip(sp.prop, sp.tone), m.x, m.y + tk * 0.1, tk * 0.55);
      beat(c); await wait(200); squash(tokOf(e.seat)); mk(e.seat, word, sp.tone);
      await wait(420); return finish(200);
    }
    await Promise.all(tg.map(async id => {
      const p = at(id), c = put(chip(sp.prop, sp.tone), m.x, m.y, tk * 0.52);
      sfx('whoosh', 0.6);
      await moveTo(c, { x: p.x, y: p.y - tk * 0.35 }, 380, { lift: tk * 0.9 });
      sfx(land === 'blot' ? 'drip' : land === 'dome' ? 'shimmer' : land === 'tag' ? 'key' : 'tag');
      squash(tokOf(id), 0.6); ring(p.x, p.y, sp.tone);
      if (land === 'blot') blot(p.x, p.y, sp.tone, tk * 1.1);
      if (land === 'dome') ring(p.x, p.y, sp.tone, tk * 1.35, 1, 300);
      if (land === 'tag') { const t = put(sticker('price-tag', 'brass'), p.x + tk * 0.4, p.y + tk * 0.3, tk * 0.6); t.style.transformOrigin = '78% 14%'; anim(t, [{ rotate: '24deg' }, { rotate: '-10deg' }, { rotate: '0deg' }], { duration: 500 }); }
      if (word) mk(id, word, sp.tone);
    }));
    await wait(360);
    await finish(200);
  });
  // 夜殺：信物從上面刺下（草叉叉尖朝下），牌挨一下，座位才倒下（release）。一晚殺幾個人（沙巴洛斯、珀）時各挨各的，each 裏被擋下的撞一下彈開
  const stKill = scene(async (e, word = '擊殺') => {
    const list = e.each || (e.dies || e.to).map(id => ({ id, res: 'kill' }));
    await Promise.all(list.map(async (x, i) => {
      await wait(i * 160);
      const id = x.id, p = at(id), c = put(atkChip(e.src), p.x, p.y - tk * 1.5, tk * 0.6);
      anim(c, [{ transform: 'translateY(-40px) scale(1.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'ease-out' });
      sfx('whoosh', 0.6); await wait(240);
      await moveTo(c, { x: p.x, y: p.y - tk * 0.3 }, 120, { lift: 0, ease: 'cubic-bezier(.7,0,1,.5)' });
      if (x.res === 'kill') {
        sfx('stab'); sfx('thud'); squash(tokOf(id)); ring(p.x, p.y, 'evil'); burst(p.x, p.y, 'evil', { n: 10, R: tk * 0.9, keep: false });
        release(id);
        return mk(id, word, 'evil');
      }
      sfx('clang'); fade(c, 200); burst(p.x, p.y - tk * 0.3, 'brass', { n: 6, R: tk * 0.6, keep: false, big: 0.6 });
      mk(id, x.why === 'dead' ? '已死' : '擋下', x.why === 'dead' ? 'gray' : 'good');
    }));
    await wait(520);
    await finish(200);
  });
  // 擋下：僧侶的護圈先亮，叉子撞上去彈開；士兵另演（頭盔）
  const stBlocked = scene(async e => {
    const a = at(e.seat), id = e.to[0], b = at(id);
    if (e.why === 'protect') { ring(b.x, b.y, 'good', tk * 1.35, 1, 260); sfx('shimmer'); }
    const atk = put(atkChip(e.src), a.x, a.y, tk * 0.52);
    sfx('whoosh', 0.6);
    await moveTo(atk, { x: b.x - (b.x - a.x) * 0.12, y: b.y - tk * 0.35 }, 380, { lift: tk * 0.6 });
    sfx('clang');
    anim(atk, [{ transform: 'none', opacity: 1 }, { transform: `translate(${(a.x - b.x) * 0.25}px, ${-tk * 1.2}px) rotate(260deg) scale(.8)`, opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.7,.4,1)' });
    burst(b.x, b.y - tk * 0.3, 'brass', { n: 7, R: tk * 0.7, keep: false, big: 0.6 });
    mk(id, e.why === 'dead' ? '已死' : e.why === 'mayor' ? '無人死亡' : '擋下', e.why === 'dead' ? 'gray' : 'good');
    await wait(420);
    await finish(200);
  });
  // 士兵（被動，2 秒以內）：草叉飛來，頭盔從天而降扣在士兵牌上，叉子撞上去斷成兩截彈飛
  const stSoldier = scene(async e => {
    const g = e.to[0], a = at(e.seat), b = at(g);
    ring(a.x, a.y, 'evil', tk * 1.2, 1.4, 380);
    const atk = put(atkChip(e.src), a.x, a.y, tk * 0.55);
    sfx('whoosh', 0.6);
    moveTo(atk, { x: b.x + (a.x - b.x) * 0.3, y: b.y + (a.y - b.y) * 0.3 - tk * 0.3 }, 340, { lift: tk * 0.8 });
    await wait(220);
    const helm = put(sticker('visored-helm', 'good'), b.x, b.y - tk * 0.12, tk * 1.15);
    anim(helm, [{ transform: `translateY(${-tk * 1.6}px) scale(1.3)`, opacity: 0 }, { transform: 'translateY(4px) scale(.95, 1.05)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 160, easing: 'cubic-bezier(.6,0,1,.6)' });
    await wait(130);
    sfx('clang'); squash(tokOf(g), 0.5); ring(b.x, b.y, 'good', tk * 1.4, 1.6);
    await wait(10);
    await moveTo(atk, { x: b.x + (a.x - b.x) * 0.1, y: b.y + (a.y - b.y) * 0.1 - tk * 0.25 }, 90, { lift: 0, ease: 'cubic-bezier(.8,0,1,.4)' });
    sfx('crack'); sfx('clang');
    await wait(70); // 頓一下
    const r = cen(atk); atk.remove();
    halves(atkChip(e.src), r.x, r.y, r.w);
    burst(r.x, r.y, 'brass', { n: 6, R: tk * 0.6, keep: false, big: 0.5 });
    anim(helm, [{ transform: 'none' }, { transform: 'translateY(-5px) rotate(-6deg)', offset: 0.3 }, { transform: 'rotate(3deg)', offset: 0.6 }, { transform: 'none' }], { duration: 400 });
    await wait(120);
    await seatStamp(g, '擋下', 'good', { mk: true, hold: 200 });
    await finish(200);
  });
  // 刺向鎮長（等說書人決定誰替死）：叉子飛過去，綬帶一甩把叉子帶偏
  const stMayor = scene(async e => {
    const a = at(e.seat), g = e.to[0], b = at(g);
    const atk = put(atkChip(e.src), a.x, a.y, tk * 0.52);
    sfx('whoosh', 0.6);
    await moveTo(atk, { x: a.x + (b.x - a.x) * 0.7, y: a.y + (b.y - a.y) * 0.7 - tk * 0.4 }, 320, { lift: tk * 0.5 });
    const pr = put(sticker('ribbon-medal', 'brass'), b.x, b.y - tk * 0.15, tk * 1.05);
    beat(pr, 'bell'); ring(b.x, b.y, 'brass');
    anim(pr, [{ rotate: '0deg' }, { rotate: '-40deg' }, { rotate: '10deg' }], { duration: 300 });
    await moveTo(atk, { x: b.x + tk * 1.1, y: b.y - tk * 0.2 }, 300, { lift: -tk * 0.6, spin: 1 });
    fade(atk, 150);
    mk(g, '轉移', 'brass');
    await wait(360);
    await finish(200);
  });
  // 能力失效（中毒 / 醉酒 / 以為自己是這個角色的酒鬼）：同一件信物是虛線，飛到一半沉下去
  const stFail = scene(async e => {
    const sp = look(e.src), m = at(e.seat), id = e.to?.[0], p = id ? at(id) : { x: mid.x, y: mid.y };
    const c = put(chip(sp.prop, sp.tone, true), m.x, m.y, tk * 0.55);
    sfx('whoosh', 0.6);
    await moveTo(c, { x: m.x + (p.x - m.x) * 0.6, y: m.y + (p.y - m.y) * 0.6 }, 360, { lift: tk * 0.7 });
    sfx('miss');
    anim(c, [{ transform: `rotate(${rot(c)}deg)`, opacity: 1 }, { transform: `translateY(${tk * 0.5}px) scale(.5) rotate(40deg)`, opacity: 0 }], { duration: 380, easing: 'ease-in' });
    await wait(320);
    mk(e.seat, '失效', 'gray');
    await wait(280);
    await finish(200);
  });
  // 小惡魔自殺傳位：叉子從自己牌上升起，調頭刺回自己
  const stStarpass = scene(async e => {
    const id = e.seat, p = at(id), c = put(forkChip(), p.x, p.y, tk * 0.6);
    anim(c, [{ transform: 'none', opacity: 0 }, { transform: `translateY(${-tk * 1.3}px) rotate(180deg)`, opacity: 1, offset: 0.6 }, { transform: `translateY(${-tk * 0.3}px) rotate(360deg)`, opacity: 1 }],
      { duration: 520, easing: 'cubic-bezier(.4,0,.8,.6)' });
    sfx('demon'); await wait(520);
    sfx('stab'); squash(tokOf(id)); ring(p.x, p.y, 'evil', tk * 1.3, 2); burst(p.x, p.y, 'evil', { n: 8, R: tk * 0.8, keep: false });
    release(id);
    mk(id, '傳位', 'evil');
    await wait(480);
    await finish(200);
  });
  // 隱士 / 間諜登記成別的身份（說書人給了登記的信息）：蛛網罩住他的牌，牌面翻成登記的角色
  const stReg = scene(async e => {
    const id = e.reg, b = at(id), sp = look(e.src), a = at(e.seat);
    const atk = put(chip(sp.prop, sp.tone), a.x, a.y, tk * 0.5);
    sfx('whoosh', 0.6);
    await moveTo(atk, { x: b.x, y: b.y - tk * 0.5 }, 280, { lift: tk * 0.6 });
    fade(atk, 120);
    const web = put(sticker(e.regRole === 'spy' ? 'spyglass' : 'spider-web', 'evil'), b.x, b.y, tk * 1.3);
    beat(web, 'hiss'); ring(b.x, b.y, 'evil');
    await wait(100);
    const t = liftOf(id);
    await flipTo(t, e.as || 'imp');
    sfx('demon');
    await wait(260);
    await seatStamp(id, '偽裝', 'evil', { mk: true, hold: 140 });
    await finish(200);
  });

  // 說書人看到的答案短詞
  const answerWord = e => (e.kind === 'two' ? (e.none ? '沒有' : ROLES[e.role]?.name) : e.kind === 'number' ? String(e.n)
    : e.kind === 'yesno' ? (e.yes ? '有' : '沒有') : e.kind === 'role' ? ROLES[e.role]?.name : e.kind === 'text' ? '過目'
      : e.kind === 'dream' ? `${ROLES[e.good]?.name}／${ROLES[e.evil]?.name}` : '');
  // 說書人魔典上的一枚章：免疫、全場醉酒、主謀……沒有專門演出的被動結算
  const ststamp = scene(async e => { await seatStamp(e.seat, e.word, e.tone, { hold: 1100 }); await finish(); });
  const SELF_ACT = { poisoner, imp, monk, butler };
  const PICK = { fortuneteller: ftPick, ravenkeeper: rkPick };
  const SELF_INFO = { washerwoman, librarian, investigator, chef, empath, fortuneteller: ftInfo, undertaker, ravenkeeper: rkInfo, spy };
  // 下面幾張表由 fx-ab-dlc.js 填：STX 說書人魔典上有專門演出的角色，GUARD 被動擋下，PUB 全桌，DEMON 接任的前半段
  const STX = {}, GUARD = {}, PUB = {}, DEMON = {}, CHANGED = {};

  // 工具箱：DLC 角色的演出用的和暗流湧動是同一套零件。tk、mid 每段開始時才量，用 T.tk / T.mid 取
  const T = { wait, anim, sfx, h, roleToken, icon, roleIcon, ROLES, C, col, teamCol, TAU, rand, any, SELF_WASH, PUB_WASH, EVIL_WASH, HOLD, DROP, getStage, release,
    get tk() { return tk; }, get mid() { return mid; }, W, at, inward, above, later, scene, svgEl, sticker, flat, chip, put, dot, place, posOf, cen, rot, fade, stop, tween, loop, blobPath,
    develop, impress, burst, trail, puff, wisp, flecks, motes, flames, clods, feathers, waterDrop, dripping, wash, finish, beat, ring, squash, wiggle, bob, blot, lift, tokOf, liftOf, flipTo,
    moveTo, emerge, slam, pad, spotStamp, seatStamp, mk, hold, toHud, toSeat, toSeats, markAt, halves, drip, heartbeat, fly, walk, stFly, stKill, atkChip, look };
  let dlcPull = null;
  const dlc = () => (dlcPull ||= import('./fx-ab-dlc.js').then(m => {
    Object.assign(PROPS, m.PROPS_DLC);
    const d = m.dlcFx(T);
    Object.assign(ST, d.looks); Object.assign(SELF_ACT, d.act); Object.assign(PICK, d.pick); Object.assign(SELF_INFO, d.info);
    Object.assign(STX, d.st); Object.assign(GUARD, d.guard); Object.assign(PUB, d.pub); Object.assign(DEMON, d.demon); Object.assign(CHANGED, d.changed);
  }, () => { dlcPull = null; }));

  return {
    // 自己選完人；返回 null 表示這個角色沒有專門的演出（fx.js 用通用的棋子）
    act(e, me) {
      if (!me || !(e.to?.length || e.role || e.charge)) return null;
      const show = (e.pick ? PICK : SELF_ACT)[e.src];
      return show ? show(e, me) : null;
    },
    hasInfo: src => !!SELF_INFO[src],
    info(e, me) {
      if (!me || !SELF_INFO[e.src]) return null;
      if (['role', 'two'].includes(e.kind) && !e.none && !ROLES[e.role]) return null; // 答案缺了角色就不演，免得畫一張空牌
      return SELF_INFO[e.src](e, me);
    },
    ststamp: e => STX[e.src]?.(e) || ststamp(e),
    demon: (e, me) => demon(e, me),
    saint: e => saint(e),
    mayor: e => mayor(e),
    pub: (k, e) => PUB[k]?.(e),
    changed: (e, me) => (me ? CHANGED[e.src]?.(e, me) : null),
    dlc,
    // 說書人魔典；返回 null 表示交給 fx.js 舊的通用演出
    grim(e) {
      const own = !!ST[e.src], x = STX[e.src]?.(e);
      if (x) return x;
      switch (e.res) {
        case 'info': return own ? stFly(e, e.word || answerWord(e)) : null;
        case 'reg': return e.reg ? stReg(e) : null;
        case 'fail': return stFail(e);
        case 'poison': case 'protect': case 'master':
          return own ? stFly(e, e.word || { poison: '中毒', protect: '保護', master: '主人' }[e.res], { poison: 'blot', protect: 'dome', master: 'tag' }[e.res]) : null;
        case 'noop': return own ? stFly(e, e.word || ACT_ICONS[e.src]?.mark || '行動') : null; // 能力正常，但什麼也沒發生（選中的不是惡魔、角色已在場……）
        case 'charge': return ststamp({ seat: e.seat, word: '蓄力', tone: 'evil' });
        case 'kill': return e.to?.length ? stKill(e) : null;
        case 'blocked': return !e.to?.length ? null : e.why === 'soldier' ? stSoldier(e) : GUARD[e.why]?.(e) || stBlocked(e);
        case 'mayor': return e.to?.length ? stMayor(e) : null;
        case 'starpass': return e.src === 'imp' ? stStarpass(e) : null; // 方古跳到外來者身上另說
        default: return null;
      }
    },
  };
}
