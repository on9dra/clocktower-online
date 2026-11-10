// 座位標記排位：一個座位身上的小東西——狀態圖章、假身份副牌、角色提醒小牌、說書人寫的字、玩家自己的推理標記——
// 由同一個函數一起排。以前圖章在固定角度、副牌在右下、小牌朝圓心掛，三家互不知道，常疊在一起（2026-11-10）。
//  · 每個座位只用自己那一塊扇形（圓心到相鄰兩座之間的分界線），標記不會跑到鄰座那邊，一眼看得出是誰的；
//  · 狀態圖章、假身份副牌騎在頭像的圈上，先挑兩肩，避開名牌、頭頂的死亡票 / 已提 / 投票手 / 輪到誰的箭頭；
//  · 其餘的從頭像朝圓心那一側開始，貼著頭像一圈圈往外排，越要緊的越靠前（town.js 給的先後）；
//  · 實在放不下的，從最不要緊的開始收進最後一格「+N」，說書人懸停 / 點開看是哪幾枚。
// 位置記在 at 裏，重繪時直接帶上（morph 不會先清掉再補），換位置時順著 transition 滑過去；新出現的原地蓋下來。
const at = new Map(); // `${座位}|${key}` → { x, y, off }（相對頭像中心，px）
const sig = new Map(); // 座位 → 上次排位時的輸入，沒變就不重算
const over = new Map(); // 座位 → 排不下、收進「+N」的標記：[{ key, text }]
export const overflowOf = id => over.get(id) || [];

// 渲染時：給座位裏要排位的東西加上 key 和上次的位置
export function decorateSeat(seatEl, seatId) {
  const more = seatEl.querySelector(':scope > .seat-more'), list = items(seatEl);
  if (more && seatEl.querySelector(':scope > .seat-more :is(.tags, .pmarks)')) more.classList.add('mk-on'); // 準備階段只有積分那一行：照舊掛在下面
  let n = 0;
  for (const el of list) {
    if (!el.hasAttribute('data-key')) el.setAttribute('data-key', 'mk-' + (el.title || el.textContent || '') + '-' + n++);
    el.classList.add('mk');
    const p = at.get(seatId + '|' + el.getAttribute('data-key'));
    if (!p) continue;
    if (p.off) { el.classList.add('mk-off'); continue; }
    el.classList.add('at', 'glide');
    el.style.setProperty('--mx', p.x + 'px');
    el.style.setProperty('--my', p.y + 'px');
    count(el, p);
  }
}
// 「+N」的字
function count(el, p) {
  if (p.text != null) el.textContent = p.text;
}
const items = seatEl => [...seatEl.querySelectorAll(':scope > .seat-token > :is(.st-ico, .fake-badge), :scope > .seat-more :is(.tags, .pmarks) > *')];
const RIM = el => el.matches('.st-ico, .fake-badge');

// 畫完之後（fitTableCard 之前）：量好位置，排
let booted = false; // 打開頁面時已經在桌上的標記不蓋章，之後新出現的才蓋
export function placeMarks(ring) {
  if (!ring) return;
  const seats = [...ring.querySelectorAll(':scope > .seat')], n = seats.length, rw = ring.offsetWidth;
  if (!rw) return;
  for (const seat of seats) placeSeat(seat, n, rw);
  placePop(ring);
  booted = true;
}

function placeSeat(seat, n, rw) {
  const id = seat.getAttribute('data-key'), tok = seat.querySelector(':scope > .seat-token');
  const list = items(seat).filter(el => getComputedStyle(el).display !== 'none' || el.classList.contains('mk-off'));
  if (!tok || !list.length) return;
  const tk = tok.offsetWidth, r = tk / 2, i = +seat.getAttribute('data-i');
  const th = (i / n) * Math.PI * 2 - Math.PI / 2, half = n > 2 ? Math.PI / n : Math.PI;
  const sx = seat.offsetLeft - seat.offsetWidth / 2, sy = seat.offsetTop - seat.offsetHeight / 2;
  const T = { x: sx + tok.offsetLeft + r, y: sy + tok.offsetTop + r }, O = rw / 2;
  const tb = tok.getBoundingClientRect();
  const box = (el, x0 = sx, y0 = sy) => ({ x: x0 + el.offsetLeft + el.offsetWidth / 2 - T.x, y: y0 + el.offsetTop + el.offsetHeight / 2 - T.y, w: el.offsetWidth, h: el.offsetHeight });
  // 擋路的：名牌、頭頂的死亡票、已提 / 被提、投票手、真假勾、皇冠、MVP、聊天氣泡、輪到誰的箭頭
  const walls = [];
  const plate = seat.querySelector(':scope > .plate');
  if (plate?.offsetWidth) walls.push(box(plate));
  for (const el of tok.querySelectorAll(':scope > :is(.ghost-vote, .daytags, .vmark, .tm, .pin-mark, .crown, .mvp-tag, .mvp-btn, .aim-btn)')) {
    const b = el.getBoundingClientRect();
    if (b.width) walls.push({ x: b.left + b.width / 2 - tb.left - r, y: b.top + b.height / 2 - tb.top - r, w: b.width, h: b.height });
  }
  const arrow = seat.querySelector(':scope > .turn-arrow');
  if (arrow?.offsetWidth) walls.push(box(arrow));
  // 兩邊鄰座的名牌比頭像寬，斜著的座位會伸進這一塊扇形：也算擋路的
  for (const k of [i - 1, i + 1]) {
    const nb = seat.parentElement.querySelector(`:scope > .seat[data-i="${(k + n) % n}"]`), p = nb !== seat && nb?.querySelector(':scope > .plate');
    if (p?.offsetWidth) walls.push(box(p, nb.offsetLeft - nb.offsetWidth / 2, nb.offsetTop - nb.offsetHeight / 2));
  }
  // 這次的輸入沒變（頭像大小、位置、擋路的、要排的東西和大小）：沿用上次排好的
  for (const el of list) el.classList.remove('mk-off');
  const sizes = list.map(el => ({ el, key: el.getAttribute('data-key'), rim: RIM(el), w: el.offsetWidth, h: el.offsetHeight, round: RIM(el) || el.matches('.by-role, .more-chip, .pmark.act, .pm') }));
  const s = JSON.stringify([rw, n, i, Math.round(T.x), Math.round(T.y), tk, walls.map(b => [b.x, b.y, b.w, b.h].map(Math.round)), sizes.map(x => [x.key, x.w, x.h])]);
  if (sig.get(id) === s) return apply(id, sizes, null);
  sig.set(id, s);

  const ux = Math.cos(th + Math.PI), uy = Math.sin(th + Math.PI); // 朝圓心
  const sn = Math.sin(half), cs = Math.cos(half);
  // 在自己的扇形裏（離兩條分界線都至少 m），也在圓桌的方框裏
  const inSlice = (x, y, m) => {
    if (n < 3) return true;
    const vx = T.x + x - O, vy = T.y + y - O, a = vx * Math.cos(th) + vy * Math.sin(th), b = -vx * Math.sin(th) + vy * Math.cos(th);
    return a > 0 && a * sn - Math.abs(b) * cs >= m;
  };
  const inRing = (x, y, w, hh) => T.x + x - w / 2 >= 1 && T.x + x + w / 2 <= rw - 1 && T.y + y - hh / 2 >= 1 && T.y + y + hh / 2 <= rw - 1;
  const hits = (a, b, gap) => (a.round && b.round
    ? Math.hypot(a.x - b.x, a.y - b.y) < (a.w + b.w) / 2 + gap
    : Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap);
  const placed = [], out = new Map();
  const free = (c, gap, vsTok, taken = placed) => {
    if (!inRing(c.x, c.y, c.w, c.h)) return false;
    if (c.round ? !inSlice(c.x, c.y, c.w / 2 - 1) : ![[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([p, q]) => inSlice(c.x + p * c.w / 2, c.y + q * c.h / 2, 1))) return false;
    if (vsTok && Math.hypot(c.x, c.y) < r + Math.max(c.w, c.h) / 2 + 2) return false;
    return !walls.some(b => hits(c, b, 2)) && !taken.some(b => hits(c, b, gap));
  };
  // 小牌角上的小符號（✓ ✗ 數字）往右下冒出 4px：帶紙色描邊，蹭到鄰牌的邊沒關係，不算進佔地，靠間距 3px 讓開

  // 1. 頭像邊上：假身份副牌、狀態圖章。先試兩肩（離朝圓心的方向 120° 左右），再往兩邊找
  const lane = [];
  const ANG = [];
  for (let d = 0; d <= 180; d += 15) for (const sg of [-1, 1]) if (!(d === 0 && sg === 1) && !(d === 180 && sg === 1)) ANG.push(sg * d);
  ANG.sort((p, q) => Math.abs(Math.abs(p) - 120) - Math.abs(Math.abs(q) - 120) || p - q);
  const base = Math.atan2(uy, ux);
  for (const x of sizes.filter(x => x.rim)) {
    const rr = x.el.matches('.fake-badge') ? r * .82 : r;
    let ok = null;
    for (const a of ANG) {
      const ph = base + (a * Math.PI) / 180, c = { x: rr * Math.cos(ph), y: rr * Math.sin(ph), w: x.w, h: x.h, round: true };
      if (free(c, 1, false)) { ok = c; break; }
    }
    if (ok) { placed.push(ok); out.set(x.key, ok); } else lane.push(x); // 邊上沒地方：排到朝圓心那一串的最前面
  }
  // 2. 朝圓心那一側：從頭像邊開始，一圈一圈往外，每圈從正對圓心的地方往兩邊找空位
  lane.push(...sizes.filter(x => !x.rim));
  const maxR = r + 4.2 * Math.max(16, ...lane.map(x => x.h)), core = rw * .07;
  // 候選位置按「離頭像多遠 + 偏離正對圓心多少」排序：先貼著頭像朝圓心的那一側，繞到頭像兩邊要多付代價（偏 1 弧度約等於往外 0.35 圈半徑）
  const spot = (x0, taken) => {
    const x = x0, hs = Math.max(x.w, x.h) / 2, rho0 = r + 2 + hs, cand = [];
    for (let rho = rho0; rho <= maxR; rho += 2) {
      const step = 3 / rho;
      for (let k = 0; k * step <= 1.95; k++) for (const sg of k ? [1, -1] : [1]) cand.push([rho - rho0 + .35 * rho * k * step + (sg < 0 ? .01 : 0), rho, sg * k * step]);
    }
    cand.sort((p, q) => p[0] - q[0]);
    for (const [, rho, a] of cand) {
      const ph = base + a, c = { x: rho * Math.cos(ph), y: rho * Math.sin(ph), w: x.w, h: x.h, round: x.round };
      if (Math.hypot(T.x + c.x - O, T.y + c.y - O) < core) continue;
      if (free(c, 3, true, taken)) return c;
    }
    return null;
  };
  const tryAll = list => {
    const taken = [...placed], res = new Map();
    for (const x of list) { const c = spot(x, taken); if (!c) return null; taken.push(c); res.set(x.key, c); }
    return res;
  };
  // 放不下：最後一格換成「+N」，從最不要緊的開始收進去，要緊的一直留在桌上
  const moreX = lane.find(x => x.el.classList.contains('more-chip')), now = lane.filter(x => x !== moreX);
  let got = tryAll(now), hidden = [];
  if (!got) {
    for (let k = now.length - 1; k >= 0 && !got; k--) if ((got = moreX && tryAll([...now.slice(0, k), moreX]))) hidden = now.slice(k);
    if (!got) { got = new Map(); hidden = now; }
    if (moreX && got.has(moreX.key)) got.set(moreX.key, { ...got.get(moreX.key), text: '+' + hidden.length });
  }
  for (const [k, c] of got) out.set(k, c);
  // 收起來的是哪幾枚（紙條上畫）：key 裏是標記原文（title 已經翻成當前語言了）
  over.set(id, hidden.map(x => ({ key: x.key, text: x.key.startsWith('tg-') ? x.key.slice(3) : x.el.title })));
  for (const x of sizes) if (!out.has(x.key)) out.set(x.key, { off: true });
  apply(id, sizes, out);
}

function apply(id, sizes, out) {
  for (const x of sizes) {
    const k = id + '|' + x.key;
    if (out) { const p = out.get(x.key); at.set(k, p.off ? { off: true } : { x: +p.x.toFixed(1), y: +p.y.toFixed(1), text: p.text }); }
    const p = at.get(k);
    if (!p) continue;
    const el = x.el;
    if (p.off) { el.classList.add('mk-off'); continue; }
    count(el, p);
    const was = el.classList.contains('at');
    el.style.setProperty('--mx', p.x + 'px');
    el.style.setProperty('--my', p.y + 'px');
    if (was) continue;
    // 新來的：原地蓋下來（狀態圖章自己有蓋章的動畫），不從別處滑過來
    el.classList.add('at');
    void el.offsetWidth;
    el.classList.add('glide');
    if (booted && !x.rim && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      el.animate([{ scale: 1.8, opacity: 0 }, { scale: .92, opacity: 1, offset: .6 }, { scale: 1, opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.4, 0, .6, 1)' });
  }
}

// ───── 「+N」攤開：懸停（鼠標）或點一下（觸屏，點別處收起） ─────
export const more = { seat: null, sticky: false };
let outside = null;
export function openMore(ctx, seatId, sticky) {
  if (more.seat === seatId && more.sticky && sticky) return closeMore(ctx);
  Object.assign(more, { seat: seatId, sticky: !!sticky || (more.seat === seatId && more.sticky) });
  if (more.sticky && !outside) {
    outside = e => { if (!e.target.closest?.('.more-chip, .more-pop')) closeMore(ctx); };
    document.addEventListener('pointerdown', outside, true);
  }
  ctx.render();
}
export function closeMore(ctx, hover) {
  if (hover && more.sticky) return;
  if (outside) { document.removeEventListener('pointerdown', outside, true); outside = null; }
  if (!more.seat) return;
  Object.assign(more, { seat: null, sticky: false });
  ctx.render();
}
// 攤開的那張紙條：貼著「+N」，朝圓心那邊打開，不出圓桌
function placePop(ring) {
  const pop = ring.querySelector(':scope > .more-pop:not(.leaving)');
  if (!pop) return;
  const seat = ring.querySelector(`:scope > .seat[data-key="${pop.dataset.seat}"]`), chip = seat?.querySelector('.more-chip:not(.mk-off)');
  if (!chip) return;
  const o = ring.getBoundingClientRect(), p = chip.getBoundingClientRect(), rw = ring.offsetWidth;
  const cx = p.left + p.width / 2 - o.left, cy = p.top + p.height / 2 - o.top, w = pop.offsetWidth, hh = pop.offsetHeight;
  const dx = rw / 2 - cx, dy = rw / 2 - cy, d = Math.hypot(dx, dy) || 1;
  const reach = Math.abs(dx / d) * (w / 2) + Math.abs(dy / d) * (hh / 2) + Math.max(p.width, p.height) / 2 + 6;
  const x = Math.min(Math.max(cx + (dx / d) * reach, w / 2 + 2), rw - w / 2 - 2), y = Math.min(Math.max(cy + (dy / d) * reach, hh / 2 + 2), rw - hh / 2 - 2);
  pop.style.left = x + 'px';
  pop.style.top = y + 'px';
  pop.style.setProperty('--ox', cx - x + 'px');
  pop.style.setProperty('--oy', cy - y + 'px');
}
