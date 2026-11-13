// /admin 的「問題」頁和房間時間線（數據見 lib/issues.js，日誌見 lib/trace.js）。給開發者看：信息全、點得進去，不講究演出
import { ROLES } from '../public/js/roles.js';
import { NIGHT } from './night.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
// 夜裏每一步的名字：角色名，或者爪牙信息、惡魔信息這些
export const stepNames = () => ({ ...Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, r.name])), ...Object.fromEntries(Object.entries(NIGHT).filter(([, v]) => v.name).map(([k, v]) => [k, v.name])), dawn: '天亮前確認' });

export const ISSUES_CSS = `
.iss h2{display:flex;align-items:baseline;gap:10px;margin-top:28px}.iss h2 b{font-weight:normal;color:var(--ink);font-variant-numeric:tabular-nums}
.big a{color:inherit;text-decoration:none;cursor:pointer}.big .zero b{color:var(--muted)}
.iss tr.more{cursor:pointer}.iss tr.more:hover td,.iss tr.open td{background:#2a26220d}
.iss td.wrap{white-space:normal;min-width:160px;max-width:380px;word-break:break-word}
.iss tr.det td{white-space:normal;padding:2px 8px 12px;background:#2a26220d}
.iss .smp{padding:6px 0;border-top:1px dashed var(--line)}.iss .smp:first-child{border-top:0}
pre{font:12px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;margin:4px 0}
.mono{font:12px ui-monospace,Consolas,monospace}
.side{display:inline-block;font-size:11px;padding:0 5px;border:1px solid currentColor;margin-right:6px}
.side.s{color:var(--red)}.side.c{color:#2f5d8a}.side.f{color:#c08a3e}
tr.old{opacity:.5}.bad{color:var(--red)}.dim{color:var(--muted)}
.fun{display:grid;grid-template-columns:max-content 1fr max-content;gap:6px 12px;align-items:center;max-width:720px}.fun i{display:block;height:10px;background:var(--ink)}
.mini{display:flex;flex-wrap:wrap;gap:6px 28px;margin:6px 0 10px}.mini b{display:block;font-size:20px;font-variant-numeric:tabular-nums}.mini span{font-size:12px;color:var(--muted)}
#iss{transition:opacity .2s}a{color:inherit}
`;

export const ISSUES_PAGE = `<section class="page iss" aria-hidden="true"><div class="range"></div><div class="big" id="ik"></div><div id="iss"></div></section>`;

// 瀏覽器裏畫「問題」頁：換時間範圍時向服務器要一次（/admin/issues），同一範圍只要一次
export const issuesClient = () => String.raw`
const KEY = new URLSearchParams(location.search).get('key') || '';
const STEPS = ${JSON.stringify(stepNames()).replace(/</g, '\\u003c')};
const q = (p, o) => p + '?' + new URLSearchParams({ key: KEY, ...o });
const roomA = (r, t, i) => r ? '<a href="' + q('/admin/room', { r, t: t || '', ...(i ? { i } : {}) }) + '">' + r + '</a>' : '';
const secs = ms => ms == null ? '–' : ms === Infinity ? '更久' : ms < 1000 ? Math.round(ms) + ' 毫秒' : ms < 60000 ? (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' 秒' : Math.floor(ms / 60000) + ' 分 ' + Math.round(ms % 60000 / 1000) + ' 秒';
const when = t => md(t) + ' ' + hm(t);
const AT = { lobby: '準備', ended: '結束', night: '夜裏', day: '白天', dawn: '天亮' };
const spread = (list, name = x => esc(x)) => list.length === 1 ? name(list[0][0]) : list.map(([k, n]) => name(k) + '（' + n + '）').join('<br>');
const atName = a => { const m = String(a || '').match(/^(night|day|dawn)(\d+)$/); return m ? (m[1] === 'night' ? '第' + m[2] + '夜' : m[1] === 'dawn' ? '第' + m[2] + '天天亮' : '第' + m[2] + '天') : AT[a] || a || ''; };
const ST = { choose: '選人', decide: '裁定', ack: '確認結果', confirm: '確認', mark: '標記', review: '天亮確認', fake: '假裝叫醒' };
const WHY = { 'transport close': '關頁面 / 網斷了', 'ping timeout': '網絡卡住', 'transport error': '連接出錯', 'server shutting down': '服務器重啓', 'server namespace disconnect': '服務器斷開', 'parse error': '數據壞了' };
const HOW = { create: '建房', st: '說書人回房', pl: '玩家進房', claim: '重連鏈接' };
const FAIL = { old: '瀏覽器太舊', load: '沒有載入完成' };
const modeName = m => D.modes[m] ? '<span style="color:' + D.modes[m][1] + '">' + D.modes[m][0] + '</span>' : esc(m || '');
const byName = b => b == null ? '' : b === 'st' ? '說書人' : b === 'w' ? '觀眾' : b === '-' ? '未入座' : String(b).startsWith('st>') ? '說書人→' + String(b).slice(3) + '號' : b + '號';
const pctOf = (a, b) => b ? Math.round(a / b * 100) + '%' : '–';
const table = (head, rows, cls) => rows.length ? '<div class="scroll"><table' + (cls ? ' class="' + cls + '"' : '') + '><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr>' + rows.join('') + '</table></div>' : '';
const sec = (id, title, n, body) => body ? '<h2 id="' + id + '">' + title + (n != null ? '<b>' + n + '</b>' : '') + '</h2>' + body : '';
const sum = a => a.reduce((n, x) => n + x.n, 0);
// 點一行展開下面的明細（例子、調用棧、房間鏈接），再點收起
const more = (cells, detail, cls = '') => '<tr class="more ' + cls + '">' + cells.map(c => '<td' + (c && c.wrap ? ' class="wrap"' : '') + '>' + (c && c.wrap ? c.wrap : c ?? '') + '</td>').join('') + '</tr><tr class="det" hidden><td colspan="' + cells.length + '">' + detail + '</td></tr>';
const W = s => ({ wrap: s });

let issCache = {}, issSeq = 0;
async function drawIssues(force) {
  const d = range, box = $('#iss');
  if (!issCache[d] || force) {
    const seq = ++issSeq;
    box.style.opacity = .35;
    try { const r = await fetch(q('/admin/issues', { days: d })); if (!r.ok) throw 0; issCache[d] = await r.json(); }
    catch { if (seq === issSeq) { box.style.opacity = ''; box.innerHTML = '<p class="dim">讀不到</p>'; } return; }
    if (seq !== issSeq || d !== range) return;
  }
  box.style.opacity = '';
  renderIssues(issCache[d]);
  setTimeout(fit);
}

function renderIssues(I) {
  const k = I.kpi;
  $('#ik').innerHTML = [[k.srv, '服務器錯誤', 's-err'], [k.cli, '前端錯誤', 's-err'], [k.fail, '打不開', 's-fail'], [k.refused, '被拒的操作', 's-ref'], [k.disc, '斷線', 's-net'], [k.rage, '連點', 's-rage'], [k.fb, '反饋', 's-fb']]
    .map(([v, name, id]) => '<a data-go="' + id + '" class="' + (v ? '' : 'zero') + '"><b>' + v + '</b><span>' + name + '</span></a>').join('');
  const out = [];
  // 錯誤：同一類（去掉數字、引號裏的名字，加上第一個出錯位置）歸一行；只在舊版本出現過的淡一些（多半已經修了）
  out.push(sec('s-err', '錯誤', I.errors.length ? sum(I.errors) : null, table(['次數', '人', '位置', '錯誤', '瀏覽器', '最近'], I.errors.map(g => {
    const old = g.builds.length && !g.builds.includes(I.build);
    const side = g.side === '服務器' ? 's' : g.side === '演出' ? 'f' : 'c';
    const det = g.samples.slice().reverse().map(x => '<div class="smp"><span class="dim">' + when(x.t) + '</span> ' + roomA(x.r, x.t, x.i) + ' ' + atName(x.at) + ' ' + byName(x.by ?? (x.st ? 'st' : x.seat))
      + (x.op ? ' <span class="mono">' + esc(x.op) + '</span>' : '') + (x.w ? ' <span class="dim">' + esc(x.w) + '</span>' : '') + (x.br ? ' <span class="dim">' + esc(x.br + ' · ' + (x.os || '')) + '</span>' : '')
      + (x.snap ? ' <a href="' + q('/admin/crash', { f: x.snap }) + '">快照</a>' : '') + (x.build ? ' <span class="dim mono">' + esc(x.build) + '</span>' : '')
      + '<pre>' + esc(x.msg) + (x.src ? '\n' + esc(x.src) : '') + (x.stack ? '\n' + esc(x.stack) : '') + '</pre></div>').join('');
    return more([g.n, g.who, '<span class="side ' + side + '">' + g.side + '</span><span class="mono">' + esc(g.at) + '</span>', W(esc(g.msg)), W(spread(g.br)), ago(I.now - g.last)], det, old ? 'old' : '');
  }))));
  out.push(sec('s-fb', '反饋', I.feedback.length || null, table(['時間', '房間', '內容', '聯繫'], I.feedback.map(f => '<tr><td>' + when(f.t) + '</td><td>' + roomA(f.r, f.t) + '</td><td class="wrap">' + esc(f.text) + '</td><td class="wrap">' + esc(f.contact) + '</td></tr>'))));
  out.push(sec('s-fail', '打不開', (sum(I.fails) + sum(I.res)) || null, table(['次數', '原因', '瀏覽器'], I.fails.map(x => '<tr><td>' + x.n + '</td><td>' + (FAIL[x.why] || esc(x.why)) + '</td><td>' + esc(x.br) + '</td></tr>'))
    + table(['次數', '沒載入的文件', '瀏覽器'], I.res.map(x => '<tr><td>' + x.n + '</td><td class="mono">' + esc(x.url) + '</td><td>' + esc(x.br) + '</td></tr>'))));
  // 被拒的操作：點了，服務器說不行。佔比高的多半是界面讓人以為能點
  out.push(sec('s-ref', '被拒的操作', I.refused.length ? sum(I.refused) : null, table(['次數', '佔這個操作', '操作', '原因', '說書人點的', '在哪', '模式', '房間'], I.refused.map(g => more([g.n, pctOf(g.n, g.total), '<span class="mono">' + esc(g.op) + '</span>', W(esc(g.e)), pctOf(g.st, g.n),
    spread(g.ats, a => AT[a] || esc(a)), spread(g.md, modeName), g.rooms],
    g.samples.slice().reverse().map(x => '<div class="smp"><span class="dim">' + when(x.t) + '</span> ' + roomA(x.r, x.t, x.i) + ' ' + atName(x.at) + ' ' + byName(x.by) + (x.a ? ' <span class="mono dim">' + esc(JSON.stringify(x.a)) + '</span>' : '') + '</div>').join(''))))));
  out.push(sec('s-join', '進不了房間', I.joins.length ? sum(I.joins) : null, table(['次數', '怎麼進', '原因'], I.joins.map(x => '<tr><td>' + x.n + '</td><td>' + (HOW[x.how] || esc(x.how)) + '</td><td>' + esc(x.e) + '</td></tr>'))));
  // 連點：700 毫秒內在同一處點了三下以上。點的是灰按鈕的另算（灰的）
  out.push(sec('s-rage', '連點', I.rage.length ? sum(I.rage) : null, table(['次數', '人', '點的是', '在哪', '灰的'], I.rage.map(x => '<tr><td>' + x.n + '</td><td>' + x.who + '</td><td class="mono wrap">' + esc(x.sel) + '</td><td>' + spread(x.ats, a => AT[a] || esc(a)) + '</td><td>' + (x.dis || '') + '</td></tr>'))));
  out.push(sec('s-toast', '彈出的提示', I.toast.length ? sum(I.toast) : null, table(['次數', '人', '提示'], I.toast.map(x => '<tr><td>' + x.n + '</td><td>' + x.who + '</td><td class="wrap">' + esc(x.text) + '</td></tr>'))));
  // 夜裏每一步停了多久：按 90% 的局要多久排，最慢的在上面
  out.push(sec('s-step', '夜裏每一步', I.steps.length ? sum(I.steps) : null, table(['模式', '這一步', '次數', '中位', '90%', '最久', '中位停在'], I.steps.slice(0, 30).map(x => '<tr><td>' + modeName(x.md) + '</td><td>' + esc(STEPS[x.role] || x.role) + '</td><td>' + x.n + '</td><td>' + secs(x.p50) + '</td><td>' + secs(x.p90) + '</td><td>' + secs(x.max) + '</td><td class="wrap dim">'
    + Object.entries(x.d).sort((a, b) => b[1] - a[1]).map(([s, v]) => (ST[s] || esc(s)) + ' ' + secs(v)).join(' · ') + '</td></tr>'))));
  out.push(sec('s-cold', '散局', (sum(I.cold) + sum(I.abandon)) || null, table(['模式', '怎麼散的', '在哪', '這一步', '次數'], [...I.cold.map(x => ({ ...x, how: '沒人操作了' })), ...I.abandon.map(x => ({ ...x, how: '說書人放棄' }))].sort((a, b) => b.n - a.n)
    .map(x => '<tr><td>' + modeName(x.md) + '</td><td>' + x.how + '</td><td>' + atName(x.at) + '</td><td>' + esc(STEPS[x.role] || x.role || '') + '</td><td>' + x.n + '</td></tr>'))));
  out.push(sec('s-undo', '撤銷', I.undo.length ? sum(I.undo) : null, table(['模式', '撤銷的操作', '次數'], I.undo.map(x => '<tr><td>' + modeName(x.md) + '</td><td class="mono">' + esc(x.u) + '</td><td>' + x.n + '</td></tr>'))));
  const N = I.net, b = N.boot, mini = items => '<div class="mini">' + items.filter(([v]) => v !== '–' && v !== '≤ –').map(([v, k]) => '<div><b>' + v + '</b><span>' + k + '</span></div>').join('') + '</div>';
  out.push(sec('s-net', '網絡和載入', null, mini([['≤ ' + secs(N.rtt.p50), '操作來回 · 中位'], ['≤ ' + secs(N.rtt.p95), '操作來回 · 95%'], [N.rtt.to, '操作超時'],
    [secs(N.off.p50), '斷線到回來 · 中位'], [secs(N.off.p90), '斷線到回來 · 90%'], [secs(b.ready.p50), '打開到能用 · 中位'], [secs(b.ready.p90), '打開到能用 · 90%'], [secs(b.conn.p50), '連上服務器 · 中位'], [N.jank.who || '–', '卡頓過的人'], [N.jank.max ? secs(N.jank.max) : '–', '最長一次卡頓']])
    + table(['斷線原因', '次數'], N.disc.map(([w, n]) => '<tr><td>' + (WHY[w] || esc(w)) + '</td><td>' + n + '</td></tr>'))
    + table(['斷線時走的', '次數'], N.tr.map(([w, n]) => '<tr><td>' + (w === 'polling' ? '輪詢（websocket 不通）' : esc(w)) + '</td><td>' + n + '</td></tr>'))
    + table(['慢操作（服務器 ≥ 300 毫秒）', '次數'], I.slowOps.map(([o, n]) => '<tr><td class="mono">' + esc(o) + '</td><td>' + n + '</td></tr>'))));
  out.push(sec('s-dev', '瀏覽器', null, table(['瀏覽器', '訪問', '出錯', '比例'], I.devices.map(x => '<tr' + (x.bad ? ' class="bad"' : '') + '><td>' + esc(x.br) + '</td><td>' + x.n + '</td><td>' + (x.bad || '') + '</td><td>' + (x.bad ? pctOf(x.bad, x.n) : '') + '</td></tr>'))));
  const f0 = I.funnel[0][1] || 1;
  out.push(sec('s-fun', '走到哪一步', null, '<div class="fun">' + I.funnel.map(([k, n]) => '<span>' + k + '</span><i style="width:' + Math.max(1, n / f0 * 100) + '%"></i><span>' + n + ' · ' + pctOf(n, f0) + '</span>').join('') + '</div>'));
  $('#iss').innerHTML = out.join('');
}
// 展開明細；頂上的數字跳到那一段
document.addEventListener('click', e => {
  const tr = e.target.closest('.iss tr.more');
  if (tr && !e.target.closest('a')) { const d = tr.nextElementSibling; d.hidden = !d.hidden; tr.classList.toggle('open', !d.hidden); fit(); return; }
  const a = e.target.closest('[data-go]');
  if (a) { const t = document.getElementById(a.dataset.go); if (t) scrollTo({ top: t.getBoundingClientRect().top + scrollY - 12, behavior: 'smooth' }); }
});
// 現在、對局頁上的房號點進時間線
document.querySelectorAll('a.tl').forEach(a => a.href = q('/admin/room', { r: a.dataset.r, ...(a.dataset.i ? { i: a.dataset.i } : {}) }));
`;

// 房間時間線：一行一個事件，按房間（房號回收過的話不止一個）和局分段；只看問題的開關記在本機
const WHY = { 'transport close': '關頁面 / 網斷了', 'ping timeout': '網絡卡住', 'transport error': '連接出錯', 'server shutting down': '服務器重啓', 'server namespace disconnect': '服務器斷開', 'client namespace disconnect': '自己離開', 'parse error': '數據壞了' };
const HOW = { create: '建房', st: '說書人回房', pl: '進房', claim: '用重連鏈接' };
const ST = { choose: '選人', decide: '裁定', ack: '確認結果', confirm: '確認', mark: '標記', review: '天亮確認', fake: '假裝叫醒' };
const atName = a => { const m = String(a || '').match(/^(night|day|dawn)(\d+)$/); return m ? (m[1] === 'night' ? `第${m[2]}夜` : m[1] === 'dawn' ? `第${m[2]}天天亮` : `第${m[2]}天`) : { lobby: '準備', ended: '結束' }[a] || esc(a || ''); };
const byName = b => b == null ? '' : b === 'st' ? '說書人' : b === 'w' ? '觀眾' : b === '-' ? '未入座' : String(b).startsWith('st>') ? `說書人→${esc(String(b).slice(3))}號` : `${esc(b)}號`;
const secs = ms => ms == null ? '' : ms < 1000 ? `${Math.round(ms)} 毫秒` : ms < 60000 ? `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} 秒` : ms < 3600e3 ? `${Math.floor(ms / 60000)} 分 ${Math.round(ms % 60000 / 1000)} 秒` : `${Math.floor(ms / 3600e3)} 時 ${Math.round(ms % 3600e3 / 60000)} 分`;
const mono = s => `<span class="mono">${esc(s)}</span>`;

function row(x, key, STEP_NAMES) {
  const c = x.k === 'c', bad = '<span class="bad">', who = c ? `${x.st ? '說書人' : x.seat ? x.seat + '號' : x.r ? '玩家' : ''} <span class="dim mono">${esc(String(x.sid || '').slice(0, 4))}</span>` : byName(x.by);
  let what = '', problem = false;
  switch (c ? 'c.' + x.e : x.k) {
    case 'op': problem = !x.ok;
      what = `${mono(x.op)}${x.a ? ` <span class="mono dim">${esc(JSON.stringify(x.a))}</span>` : ''}${x.u ? ` 撤銷了 ${mono(x.u)}` : ''}${x.conf ? ' <span class="dim">（先問要不要結束）</span>' : ''}${x.ok ? '' : ` ${bad}✗ ${esc(x.e)}</span>`}${x.ms >= 300 ? ` <span class="bad">${x.ms} 毫秒</span>` : ''}`; break;
    case 'phase': return `<tr class="ph"><td data-t="${x.t}"></td><td colspan="2"><b>${atName(x.at)}</b> <span class="dim">${x.from ? `${atName(x.from)}用了 ${secs(x.dur)}` : ''}${x.n ? ` · ${x.n} 人` : ''}${x.win ? ` · ${x.win === 'good' ? '善良勝' : '邪惡勝'}` : ''}</span></td></tr>`;
    case 'step': what = `<span class="dim">◷ ${esc(STEP_NAMES[x.role] || x.role)}${x.seat ? ` ${x.seat}號` : ''} · ${Object.entries(x.d || {}).map(([s, v]) => `${ST[s] || esc(s)} ${secs(v)}`).join(' · ')}${x.partial ? '（重啓前開始的）' : ''}</span>`; break;
    case 'err': problem = true;
      what = `${bad}服務器出錯</span> ${esc(x.w)} ${x.op ? mono(x.op) : ''} ${esc(x.msg)}${x.snap ? ` <a href="#" data-crash="${esc(x.snap)}">快照</a>` : ''}<details><summary class="dim">調用棧</summary><pre>${esc(x.stack)}</pre></details>`; break;
    case 'join': problem = !x.ok; what = `${HOW[x.how] || esc(x.how)}${x.watch ? '（觀戰）' : ''}${x.ok ? '' : ` ${bad}✗ ${esc(x.e)}</span>`} <span class="dim mono">${esc(String(x.sid || '').slice(0, 4))}</span>`; break;
    case 'disc': problem = !['client namespace disconnect', 'transport close'].includes(x.why);
      what = `<span class="dim">斷線 · ${WHY[x.why] || esc(x.why)} · 連了 ${secs(x.dur)}${x.tr === 'polling' ? ' · 輪詢' : ''}</span> <span class="dim mono">${esc(String(x.sid || '').slice(0, 4))}</span>`; break;
    case 'cold': problem = true; what = `${bad}冷了</span> 停在 ${esc(STEP_NAMES[x.role] || x.role || '')} ${ST[x.status] || ''} · ${x.idle} 分鐘沒人操作`; break;
    case 'slow': problem = true; what = `${bad}操作太頻繁</span> ×${x.n} ${esc(x.what)}`; break;
    case 'fb': problem = true; what = `<b>反饋</b> ${esc(x.text)}`; break;
    case 'c.err': case 'c.fx': problem = true;
      what = `${bad}${x.e === 'fx' ? '演出出錯' : '前端出錯'}</span> ${esc(x.msg)} <span class="dim mono">${esc(x.src || '')}</span> <span class="dim">${esc(x.br)} · ${esc(x.os)}</span>${x.stack ? `<details><summary class="dim">調用棧</summary><pre>${esc(x.stack)}</pre></details>` : ''}`; break;
    case 'c.res': problem = true; what = `${bad}沒載入</span> ${mono(x.url)}`; break;
    case 'c.fail': problem = true; what = `${bad}打不開</span> ${esc(x.why)} <span class="dim">${esc(x.br)} · ${esc(x.os)}</span>`; break;
    case 'c.boot': what = `<span class="dim">打開 · ${esc(x.br)} · ${esc(x.os)} · ${x.w}×${x.h}${x.ready ? ` · ${secs(x.ready)}能用` : ''}${x.conn ? ` · ${secs(x.conn)}連上` : ''}</span>`; break;
    case 'c.net': problem = true; what = `斷線 ${secs(x.off)} 後回來 <span class="dim">${esc(WHY[x.why] || x.why || '')}${x.slip ? ' · 看到了重連紙條' : ''}</span>`; break;
    case 'c.rtt': what = `<span class="dim">操作 ${x.n} 次${x.to ? ` · <span class="bad">超時 ${x.to}</span>` : ''}${x.slow ? ` · 慢的 ${esc(x.slow)}` : ''}</span>`; problem = !!x.to; break;
    case 'c.toast': problem = true; what = `提示「${esc(x.text)}」`; break;
    case 'c.rage': problem = true; what = `${bad}連點</span> ${x.cnt} 下 ${mono(x.sel)}${x.dis ? '（灰的）' : ''}`; break;
    case 'c.jank': problem = true; what = `卡頓 ${x.n} 次，最長 ${x.max} 毫秒`; break;
    case 'c.end': what = `<span class="dim">${x.final ? '離開' : '切到後台'} · 待了 ${secs(x.dur)}</span>`; break;
    default: what = `<span class="mono dim">${esc(JSON.stringify(x))}</span>`;
  }
  return `<tr class="${problem ? 'p' : 'n'}" data-k="${key}"><td data-t="${x.t}"></td><td>${who}</td><td class="wrap">${what}</td></tr>`;
}

export function roomPage({ code, t, inst, recs }) {
  const parts = [], STEP_NAMES = stepNames();
  let cur = null, g = null;
  recs.forEach((x, n) => {
    if (x.k === 'c' && x.e === 'rtt' && !x.to && !x.slow) return;
    if (x.i && x.i !== cur) { cur = x.i; g = null; parts.push(`<tr class="inst"><td colspan="3">房間 ${esc(code)} <span class="mono dim">${esc(x.i)}</span></td></tr>`); }
    if (x.g && x.g !== g) { g = x.g; parts.push(`<tr class="gm"><td colspan="3">一局 <span class="mono dim">${esc(x.g)}</span> ${x.md ? `<span class="dim">${{ on: '線上', multi: '線下·多設備', one: '線下·單設備' }[x.md] || ''}</span>` : ''}</td></tr>`); }
    parts.push(row(x, n, STEP_NAMES));
  });
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>房間 ${esc(code)}</title>
<style>
:root{--paper:#f3ecdc;--ink:#2a2622;--muted:#2a262299;--line:#2a26221f;--red:#a3402e}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:12px 16px;background:var(--paper);border-bottom:2px solid var(--ink)}
header b{font-size:18px}header button{font:inherit;background:none;border:1px solid var(--ink);color:var(--ink);padding:3px 10px;cursor:pointer}header button[aria-pressed=true]{background:var(--ink);color:var(--paper)}
main{padding:8px 16px 40px;overflow-x:auto}table{border-collapse:collapse;width:100%;max-width:1100px}
td{padding:4px 8px;border-bottom:1px solid var(--line);vertical-align:top;white-space:nowrap;font-variant-numeric:tabular-nums}td.wrap{white-space:normal;word-break:break-word;width:100%}
tr.ph td{padding-top:14px;border-bottom:1px solid var(--ink)}tr.inst td{padding-top:22px;font-size:16px;font-weight:bold}tr.gm td{padding-top:12px;color:var(--muted)}
tr.here td{background:#a3402e1a}body.only tr.n{display:none}
.bad{color:var(--red)}.dim{color:var(--muted)}.mono{font:12px ui-monospace,Consolas,monospace}pre{font:12px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;margin:4px 0}
details summary{cursor:pointer;font-size:12px}a{color:inherit}
</style>
<header><a id="back">← 後台</a><b>房間 ${esc(code)}</b><span class="dim">${recs.length} 條</span><button id="only" aria-pressed="false">只看問題</button></header>
<main>${recs.length ? `<table>${parts.join('')}</table>` : '<p class="dim">這段時間沒有記錄</p>'}</main>
<script>
const KEY = new URLSearchParams(location.search).get('key') || '', T = ${Number(t) || 0};
const pad = n => String(n).padStart(2, '0');
document.querySelectorAll('[data-t]').forEach(td => { const d = new Date(+td.dataset.t); td.textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); });
document.getElementById('back').href = '/admin?key=' + encodeURIComponent(KEY);
document.querySelectorAll('[data-crash]').forEach(a => a.href = '/admin/crash?key=' + encodeURIComponent(KEY) + '&f=' + encodeURIComponent(a.dataset.crash));
const only = document.getElementById('only'), set = on => { document.body.classList.toggle('only', on); only.setAttribute('aria-pressed', on); try { localStorage.adminOnly = on ? 1 : ''; } catch {} };
only.onclick = () => set(!document.body.classList.contains('only'));
try { set(!!localStorage.adminOnly); } catch {}
// 帶著時刻點進來的：最近的那一行標出來、滾到中間
let best = null, bd = Infinity;
document.querySelectorAll('tr[data-k] td[data-t]').forEach(td => { const d = Math.abs(td.dataset.t - T); if (d < bd && td.offsetParent) { bd = d; best = td.parentNode; } });
if (best && T) { best.classList.add('here'); best.scrollIntoView({ block: 'center' }); }
</script>`;
}
