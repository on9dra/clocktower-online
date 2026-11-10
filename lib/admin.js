// /admin 頁面：現在 / 趨勢 / 對局 三頁。數據嵌在頁面裏，圖在瀏覽器裏畫（時間按看的人的本地時區）
const PHASE = { lobby: '大廳', night: '夜晚', dawn: '天亮', day: '白天', ended: '已結束' };
const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

export function adminPage({ rooms, lobby, samples, visits = [], games, running }) {
  const now = Date.now();
  const live = rooms.filter(x => x.st || x.on || x.watch);
  const people = live.reduce((n, x) => n + x.st + x.on + x.watch, 0) + lobby;
  const phase = r => (PHASE[r.phase] || esc(r.phase)) + (r.phase === 'night' ? ` · 第${r.g.night}夜` : r.phase === 'day' || r.phase === 'dawn' ? ` · 第${r.g.day}天` : '');
  const tr = rooms.map(({ r, st, on, watch, idle }) => `<tr class="${st || on || watch ? 'live' : ''}"><td>${esc(r.code)}</td><td>${phase(r)}</td>`
    + `<td>${st ? '●' : '○'}</td><td>${on}/${r.seats.length}</td><td>${watch || ''}</td><td data-ago="${now - idle}"></td></tr>`).join('');
  // 嵌進 <script> 的 JSON：</script> 和 <!-- 不能原樣出現
  const data = JSON.stringify({ now, samples: samples.map(s => [s.t, s.people, s.inGame]), visits: visits.map(v => [v.t, v.v]), games, running }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>在線 ${people}</title>
<style>
:root{--paper:#f3ecdc;--ink:#2a2622;--muted:#2a262299;--line:#2a26221f;--red:#a3402e}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,sans-serif;overflow-x:hidden}
nav{display:flex;gap:4px;padding:14px 16px 0;border-bottom:2px solid var(--ink)}
nav button,.range button{font:inherit;background:none;border:0;color:var(--muted);padding:6px 12px;cursor:pointer;position:relative}
nav button[aria-current]{color:var(--ink);font-weight:bold}
nav button[aria-current]::after{content:'';position:absolute;left:8px;right:8px;bottom:-2px;height:4px;background:var(--red)}
.range{display:flex;gap:2px;margin:0 0 14px}.range button{padding:3px 10px;border:1px solid transparent}
.range button[aria-pressed=true]{color:var(--ink);border-color:var(--ink)}
.view{overflow:hidden;transition:height .45s cubic-bezier(.3,.7,.2,1)}.track{display:flex;align-items:flex-start;transition:transform .45s cubic-bezier(.3,.7,.2,1)}
.page{flex:0 0 100%;padding:16px;max-width:100vw;transition:opacity .45s}.page[aria-hidden=true]{opacity:0}
.big{display:flex;flex-wrap:wrap;gap:8px 28px;margin:4px 0 18px}.big b{display:block;font-size:34px;line-height:1.1;font-variant-numeric:tabular-nums}.big span{font-size:12px;color:var(--muted)}
h2{font-size:13px;font-weight:normal;color:var(--muted);margin:22px 0 4px}
table{border-collapse:collapse;width:100%;max-width:720px;font-variant-numeric:tabular-nums}
th,td{padding:6px 8px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}th{font-size:12px;color:var(--muted);font-weight:normal}
tr.dim,#now tr:not(.live){opacity:.45}tr.live td:first-child{font-weight:bold}
.chart{position:relative;max-width:720px}.chart svg{display:block;width:100%;height:auto;overflow:visible}
.chart text{font-size:11px;fill:var(--muted);font-variant-numeric:tabular-nums}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--paper);font-size:12px;padding:4px 8px;white-space:nowrap;opacity:0;transition:opacity .15s;transform:translate(-50%,-110%)}
.legend{display:flex;gap:16px;font-size:12px;color:var(--muted);margin:2px 0 6px}.legend i{display:inline-block;width:14px;height:2px;vertical-align:middle;margin-right:6px}
.scroll{overflow-x:auto;max-width:720px}.good{color:#2f5d8a}.evil{color:var(--red)}
</style>
<nav><button data-p="0" aria-current="page">現在</button><button data-p="1">趨勢</button><button data-p="2">對局</button></nav>
<div class="view"><div class="track">
<section class="page" id="now">
<div class="big"><div><b>${people}</b><span>在線</span></div><div><b>${live.length}</b><span>有人的房間</span></div><div><b>${lobby}</b><span>大廳</span></div></div>
<div class="scroll"><table><tr><th>房號</th><th>階段</th><th>說書人</th><th>玩家</th><th>觀眾</th><th>上次動靜</th></tr>${tr}</table></div>
</section>
<section class="page" aria-hidden="true"><div class="range"></div>
<div class="big" id="tk"></div>
<div class="legend"><span><i style="background:var(--ink)"></i>在線</span><span><i style="background:var(--red)"></i>遊戲中</span></div>
<div class="chart" id="line"></div>
<h2>按鐘點平均在線</h2><div class="chart" id="hours"></div>
<h2>訪問人次</h2><div class="chart" id="vbars"></div>
</section>
<section class="page" aria-hidden="true"><div class="range"></div>
<div class="big" id="gk"></div>
<h2>開局數</h2><div class="chart" id="gbars"></div>
<h2>遊玩時長（人·小時）</h2><div class="chart" id="hbars"></div>
<h2>劇本</h2><div class="scroll"><table id="scripts"></table></div>
<h2>最近的局</h2><div class="scroll"><table id="recent"></table></div>
</section>
</div></div>
<script>
const D = ${data};
${CLIENT}
</script>`;
}

const CLIENT = String.raw`
const $ = s => document.querySelector(s), H = 3600e3, DAY = 86400e3;
const pad = n => String(n).padStart(2, '0');
const hm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const md = t => { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate(); };
const ago = ms => ms < 6e4 ? '剛剛' : ms < H ? Math.floor(ms / 6e4) + ' 分鐘' : ms < DAY ? Math.floor(ms / H) + ' 小時' : Math.floor(ms / DAY) + ' 天';
const dur = m => m < 60 ? m + ' 分' : Math.floor(m / 60) + ' 時 ' + (m % 60) + ' 分';
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), i = s.length >> 1; return s.length % 2 ? s[i] : Math.round((s[i - 1] + s[i]) / 2); };
document.querySelectorAll('[data-ago]').forEach(td => td.textContent = ago(D.now - td.dataset.ago));

// 翻頁：整條滑過去，換頁的那一頁淡入淡出
const pages = [...document.querySelectorAll('.page')], tabs = [...document.querySelectorAll('nav button')];
let cur = 0;
const fit = () => $('.view').style.height = pages[cur].offsetHeight + 'px';
function go(i) {
  if (i !== cur && scrollY) scrollTo({ top: 0, behavior: 'smooth' });
  cur = i; fit();
  $('.track').style.transform = 'translateX(' + (-100 * i) + '%)';
  pages.forEach((p, j) => p.setAttribute('aria-hidden', j !== i));
  tabs.forEach((b, j) => j === i ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  try { localStorage.adminPage = i; } catch {}
}
tabs.forEach((b, i) => b.onclick = () => go(i));

const svgNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const e = document.createElementNS(svgNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
// 刻度：1 / 2 / 5 × 10ⁿ 裏最小的、最多五格就能裝下 v 的那個
const nice = v => { v = Math.max(v, 1); for (let p = 10 ** Math.floor(Math.log10(v) - 1); ; p *= 10) for (const f of [1, 2, 5]) if (Math.ceil(v / (f * p)) <= 5 && f * p >= 1) return { step: f * p, max: Math.ceil(v / (f * p)) * f * p }; };
function frame(box, w, h, { max, step }) {
  box.replaceChildren();
  const svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h }, box);
  const tip = document.createElement('div'); tip.className = 'tip'; box.appendChild(tip);
  for (let k = 0; k * step <= max; k++) {
    const y = 10 + (h - 34) * (1 - k * step / max);
    el('line', { x1: 34, x2: w - 6, y1: y, y2: y, stroke: k ? 'var(--line)' : 'var(--ink)', 'stroke-width': k ? 1 : 1.2 }, svg);
    el('text', { x: 28, y: y + 4, 'text-anchor': 'end' }, svg).textContent = Math.round(k * step * 10) / 10;
  }
  return { svg, tip, y: v => 10 + (h - 34) * (1 - v / max), show(x, y, html) { tip.innerHTML = html; tip.style.left = x / w * 100 + '%'; tip.style.top = y / h * box.clientWidth * h / w + 'px'; tip.style.opacity = 1; } };
}

// 在線趨勢：兩條線，停機的空檔斷開；十字線 + 提示
function line(box, from, to, step) {
  const W = box.clientWidth || 720, Hh = 220, pts = D.samples.filter(p => p[0] >= from);
  const sc = nice(Math.max(1, ...pts.map(p => p[1])));
  const f = frame(box, W, Hh, sc), x = t => 34 + (W - 40) * (t - from) / (to - from);
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    const lt = step < DAY ? new Date(t).setMinutes(0, 0, 0) : new Date(t).setHours(0, 0, 0, 0);
    el('text', { x: x(lt), y: Hh - 6, 'text-anchor': 'middle' }, f.svg).textContent = step < DAY ? hm(lt) : md(lt);
  }
  for (const [i, color] of [[1, 'var(--ink)'], [2, 'var(--red)']]) {
    let d = '', prev = 0;
    for (const p of pts) { d += (p[0] - prev > 15 * 6e4 ? 'M' : 'L') + x(p[0]).toFixed(1) + ' ' + f.y(p[i]).toFixed(1); prev = p[0]; }
    el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, f.svg);
  }
  const cross = el('line', { y1: 10, y2: Hh - 24, stroke: 'var(--muted)', opacity: 0 }, f.svg);
  const hit = el('rect', { x: 34, y: 0, width: W - 40, height: Hh, fill: 'transparent' }, f.svg);
  hit.onpointermove = e => {
    if (!pts.length) return;
    const r = f.svg.getBoundingClientRect(), t = from + ((e.clientX - r.left) / r.width * W - 34) / (W - 40) * (to - from);
    const p = pts.reduce((a, b) => Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a);
    cross.setAttribute('x1', x(p[0])); cross.setAttribute('x2', x(p[0])); cross.setAttribute('opacity', 1);
    f.show(x(p[0]), f.y(p[1]), md(p[0]) + ' ' + hm(p[0]) + '　在線 ' + p[1] + '　遊戲中 ' + p[2]);
  };
  hit.onpointerleave = () => { cross.setAttribute('opacity', 0); f.tip.style.opacity = 0; };
  if (!pts.length) el('text', { x: W / 2, y: Hh / 2, 'text-anchor': 'middle' }, f.svg).textContent = '還沒有記錄';
}

// 柱狀圖：每根柱子整列都能懸停
function bars(box, list, fmt) {
  const W = box.clientWidth || 720, Hh = 180, sc = nice(Math.max(1, ...list.map(b => b.v)));
  const f = frame(box, W, Hh, sc), bw = (W - 40) / list.length, every = Math.ceil(list.length / Math.max(4, Math.floor(W / 56)));
  list.forEach((b, i) => {
    const x0 = 34 + i * bw, y = f.y(b.v), base = f.y(0);
    if (b.v > 0) el('path', { d: 'M' + (x0 + 1) + ' ' + base + 'V' + (y + 3) + 'q0 -3 3 -3H' + (x0 + bw - 4) + 'q3 0 3 3V' + base + 'Z', fill: 'var(--ink)' }, f.svg);
    if (i % every === 0) el('text', { x: x0 + bw / 2, y: Hh - 6, 'text-anchor': 'middle' }, f.svg).textContent = b.label;
    const hit = el('rect', { x: x0, y: 0, width: bw, height: Hh, fill: 'transparent' }, f.svg);
    hit.onpointerenter = () => f.show(x0 + bw / 2, Math.min(y, base - 4), b.tip + '　' + fmt(b.v));
    hit.onpointerleave = () => f.tip.style.opacity = 0;
  });
}

// 時間桶：24 小時按小時，7 / 30 天按本地日期
function buckets(from, to, step) {
  const out = [];
  let t = step < DAY ? new Date(from).setMinutes(0, 0, 0) : new Date(from).setHours(0, 0, 0, 0);
  while (t < to) { const n = step < DAY ? t + H : new Date(t).setDate(new Date(t).getDate() + 1); out.push({ t, n, label: step < DAY ? new Date(t).getHours() + '' : md(t), tip: step < DAY ? md(t) + ' ' + hm(t) : md(t), v: 0 }); t = n; }
  return out;
}
const fill = (bs, list, val) => { for (const x of list) { const b = bs.find(b => x.t >= b.t && x.t < b.n); if (b) b.v += val(x); } return bs; };
const kpi = (box, items) => box.innerHTML = items.map(([v, k]) => '<div><b>' + v + '</b><span>' + k + '</span></div>').join('');

const COLD = 30 * 6e4;
const RANGES = [['24 小時', 1], ['7 天', 7], ['30 天', 30]];
let range = 7;
try { range = +localStorage.adminRange || 7; } catch {}
function draw() {
  const to = D.now, from = to - range * DAY, step = range === 1 ? 6 * H : range === 7 ? DAY : 5 * DAY;
  document.querySelectorAll('.range button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.d === range));
  const pts = D.samples.filter(p => p[0] >= from);
  const avg = pts.length ? (pts.reduce((n, p) => n + p[1], 0) / pts.length).toFixed(1) : 0;
  const vs = D.visits.filter(v => v[0] >= from);
  kpi($('#tk'), [[vs.length, '訪問人次'], [new Set(vs.map(v => v[1])).size, '不同訪客'],
    [Math.max(0, ...pts.map(p => p[1])), '在線峰值'], [avg, '平均在線'], [Math.max(0, ...pts.map(p => p[2])), '遊戲中峰值']]);
  line($('#line'), from, to, step);
  const hours = Array.from({ length: 24 }, (_, h) => ({ label: h + '', tip: h + ':00', v: 0, n: 0 }));
  for (const p of pts) { const h = hours[new Date(p[0]).getHours()]; h.v += p[1]; h.n++; }
  hours.forEach(h => h.v = h.n ? Math.round(h.v / h.n * 10) / 10 : 0);
  bars($('#hours'), hours, v => '平均 ' + v + ' 人');
  bars($('#vbars'), fill(buckets(from, to, step), vs.map(v => ({ t: v[0] })), () => 1), v => v + ' 人次');

  const gs = D.games.filter(g => g.t >= from), done = gs.filter(g => g.winner);
  const who = new Set(gs.flatMap(g => g.who || [])), good = done.filter(g => g.winner === 'good').length;
  kpi($('#gk'), [[gs.length + D.running.length, '開局'], [gs.length ? Math.round(done.length / gs.length * 100) + '%' : '–', '打完'],
    [done.length ? dur(median(done.map(g => g.mins))) : '–', '時長中位數'], [gs.reduce((n, g) => n + g.n, 0), '玩家人次'], [who.size, '不同玩家'],
    [done.length ? Math.round(good / done.length * 100) + '%' : '–', '善良勝率']]);
  bars($('#gbars'), fill(buckets(from, to, step), gs, () => 1), v => v + ' 局');
  bars($('#hbars'), fill(buckets(from, to, step), gs, g => g.mins * g.n / 60).map(b => (b.v = Math.round(b.v * 10) / 10, b)), v => v + ' 人·小時');
  const by = {};
  for (const g of gs) { const s = by[g.script] ||= { n: 0, done: 0, mins: [] }; s.n++; if (g.winner) { s.done++; s.mins.push(g.mins); } }
  $('#scripts').innerHTML = '<tr><th>劇本</th><th>局數</th><th>打完</th><th>時長中位數</th></tr>' + Object.entries(by).sort((a, b) => b[1].n - a[1].n)
    .map(([k, s]) => '<tr><td>' + esc(k) + '</td><td>' + s.n + '</td><td>' + s.done + '</td><td>' + (s.mins.length ? dur(median(s.mins)) : '–') + '</td></tr>').join('');
  // 半小時沒人操作的局多半是大家走了：標「冷了」，時長只算到最後一次操作
  const rows = [...D.running.map(g => ({ ...g, live: true, cold: D.now - (g.last || D.now) > COLD })), ...gs.slice().reverse()].slice(0, 40);
  setTimeout(fit);
  $('#recent').innerHTML = '<tr><th>開始</th><th>結果</th><th>時長</th><th>人數</th><th>劇本</th></tr>' + rows.map(g => '<tr class="' + ((g.live && !g.cold) || g.winner ? '' : 'dim') + '"><td>' + md(g.t) + ' ' + hm(g.t) + '</td><td>'
    + (g.cold ? '冷了' : g.live ? '進行中' : g.winner === 'good' ? '<span class="good">善良勝</span>' : g.winner === 'evil' ? '<span class="evil">邪惡勝</span>' : '中止')
    + '</td><td>' + (g.live ? dur(Math.round(((g.cold ? g.last : D.now) - g.t) / 6e4)) : dur(g.mins)) + '</td><td>' + g.n + '</td><td>' + esc(g.script) + (g.manual ? '（線下）' : '') + '</td></tr>').join('');
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';'); }
document.querySelectorAll('.range').forEach(box => box.innerHTML = RANGES.map(([k, d]) => '<button data-d="' + d + '">' + k + '</button>').join(''));
document.querySelectorAll('.range button').forEach(b => b.onclick = () => { range = +b.dataset.d; try { localStorage.adminRange = range; } catch {} draw(); });
draw();
let start = 0; try { start = +localStorage.adminPage || 0; } catch {}
const still = [$('.track'), $('.view'), ...pages];
still.forEach(e => e.style.transition = 'none');
go(start); $('.view').offsetWidth;
still.forEach(e => e.style.transition = '');
let rt, lastW = innerWidth;
addEventListener('resize', () => { fit(); clearTimeout(rt); rt = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; draw(); } }, 200); });
// 只在「現在」頁每 30 秒刷新，免得看圖時被打斷
setInterval(() => { if ($('nav button[aria-current]').dataset.p === '0') location.reload(); }, 30000);
`;
