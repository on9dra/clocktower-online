// /admin「問題」頁和房間時間線的數據：讀 lib/trace.js 寫的日誌，按種類歸併。
// 成功的操作是日誌的大頭，彙總時只數個數（被拒率的分母），不留在內存裏；時間線要看全部，按房號現讀
import fs from 'fs';
import path from 'path';
import { DIR, CRASH, fileOf, day, BUILD } from './trace.js';

const DAY = 86400e3;
// 每個文件讀過的部分：size 讀到哪（今天的文件還在長，下次只讀新加的）、recs 留下的記錄、ops 操作次數
const cache = new Map();
function load(d) {
  const f = fileOf(d);
  let size;
  try { size = fs.statSync(f).size; } catch { cache.delete(f); return null; }
  let c = cache.get(f);
  if (c && c.size === size) return c;
  if (!c || size < c.size) cache.set(f, c = { size: 0, recs: [], ops: {} });
  const fd = fs.openSync(f, 'r'), b = Buffer.alloc(size - c.size);
  try { fs.readSync(fd, b, 0, b.length, c.size); } finally { fs.closeSync(fd); }
  const end = b.lastIndexOf(10) + 1; // 寫到一半的最後一行下次再讀
  for (const line of b.subarray(0, end).toString('utf8').split('\n')) {
    if (!line) continue;
    let x;
    try { x = JSON.parse(line); } catch { continue; }
    if (x.k === 'op') {
      const o = c.ops[x.op] ||= { n: 0, bad: 0 };
      o.n++;
      if (!x.ok) o.bad++;
      if (x.ok && x.op !== 'undo' && x.op !== 'abandon') continue;
    }
    c.recs.push(x);
  }
  c.size += end;
  return c;
}
// 時間範圍內的記錄和操作次數（次數按整天算）
function range(from, to) {
  const recs = [], ops = {};
  for (let t = from; day(t) <= day(to); t += DAY) {
    const c = load(day(t));
    if (!c) continue;
    for (const x of c.recs) if (x.t >= from && x.t <= to) recs.push(x);
    for (const [k, v] of Object.entries(c.ops)) { const o = ops[k] ||= { n: 0, bad: 0 }; o.n += v.n; o.bad += v.bad; }
  }
  return { recs: recs.sort((a, b) => a.t - b.t), ops };
}

const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const top = (m, n = 4) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
const brOf = x => x.br ? x.br + (x.os ? ' · ' + x.os : '') : '';
// 同一類錯誤：數字、引號裏的名字換掉，再加上出錯的第一個本項目文件位置
const norm = m => String(m || '').replace(/\d+/g, '#').replace(/(["'`]).{0,40}?\1/g, '‹›').slice(0, 160);
function frame(x) {
  if (x.src) return x.src.replace(/:\d+$/, '');
  const m = String(x.stack || '').match(/((?:lib|js|public\/js)\/[\w.-]+\.(?:m?js)):(\d+)/) || String(x.stack || '').match(/(server\.js):(\d+)/);
  return m ? m[1].replace(/^public\//, '') + ':' + m[2] : '';
}
const sample = x => Object.fromEntries(Object.entries(x).filter(([k]) => !['k', 'hist'].includes(k)));

// 前端操作來回的分桶（public/js/diag.js 同一套）：≤50、≤100……≤6400、更久
export const RTT_EDGES = [50, 100, 200, 400, 800, 1600, 3200, 6400];
function histPct(h, p) {
  const n = h.reduce((a, b) => a + b, 0);
  if (!n) return null;
  let acc = 0;
  for (let i = 0; i < h.length; i++) { acc += h[i]; if (acc >= n * p) return i < RTT_EDGES.length ? RTT_EDGES[i] : Infinity; }
  return Infinity;
}

const FEEDBACK = () => path.join(path.dirname(DIR), 'feedback.jsonl');
function feedback(from) {
  let text = '';
  try { text = fs.readFileSync(FEEDBACK(), 'utf8'); } catch { return []; }
  return text.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(x => x && Date.parse(x.at) >= from).map(x => ({ t: Date.parse(x.at), text: x.text, contact: x.contact, r: x.room, lang: x.lang, ua: x.ua })).reverse().slice(0, 60);
}

export function issues(days, now = Date.now()) {
  const from = now - days * DAY, { recs, ops } = range(from, now);
  const errs = new Map(), refused = new Map(), joins = new Map(), rage = new Map(), toast = new Map(), res = new Map(), fails = new Map();
  const steps = new Map(), cold = new Map(), abandon = new Map(), undo = new Map(), discWhy = new Map(), discTr = new Map(), slowOps = new Map();
  const offs = [], boots = { ready: [], out: [], conn: [], css: [], nav: [] }, hist = Array(RTT_EDGES.length + 1).fill(0), jank = { s: new Set(), n: 0, max: 0 };
  let timeouts = 0, rttN = 0;
  const sess = new Map(); // sid -> { br, boot, ready, room, game, done, err }
  const S = sid => { let s = sess.get(sid); if (!s) sess.set(sid, s = {}); return s; };
  const kpi = { srv: 0, cli: 0, fail: 0, refused: 0, disc: 0, rage: 0, slow: 0 };

  for (const x of recs) {
    if (x.k === 'err' || (x.k === 'c' && (x.e === 'err' || x.e === 'fx'))) {
      const side = x.k === 'err' ? '服務器' : x.e === 'fx' ? '演出' : '前端';
      kpi[x.k === 'err' ? 'srv' : 'cli']++;
      const key = side + '|' + norm(x.msg) + '|' + frame(x);
      let g = errs.get(key);
      if (!g) errs.set(key, g = { side, msg: x.msg, at: frame(x) || x.w || '', n: 0, who: new Set(), rooms: new Set(), br: new Map(), builds: new Set(), first: x.t, samples: [] });
      g.n++; g.last = x.t;
      g.who.add(x.sid || x.r || '?');
      if (x.r) g.rooms.add(x.r);
      if (x.br) bump(g.br, brOf(x));
      if (x.build) g.builds.add(x.build);
      g.samples.push(sample(x));
      if (g.samples.length > 5) g.samples.shift();
      if (x.sid) S(x.sid).err = 1;
    } else if (x.k === 'op') {
      if (!x.ok) {
        kpi.refused++;
        const key = x.op + '|' + x.e;
        let g = refused.get(key);
        if (!g) refused.set(key, g = { op: x.op, e: x.e, n: 0, rooms: new Set(), st: 0, ats: new Map(), md: new Map(), samples: [] });
        g.n++; g.last = x.t;
        if (x.r) g.rooms.add(x.r);
        if (String(x.by).startsWith('st')) g.st++;
        bump(g.ats, String(x.at || '').replace(/\d+$/, ''));
        bump(g.md, x.md);
        g.samples.push({ t: x.t, r: x.r, i: x.i, at: x.at, by: x.by, a: x.a });
        if (g.samples.length > 4) g.samples.shift();
      } else if (x.op === 'undo') bump(undo, (x.md || '') + '|' + (x.u || '?'));
      else if (x.op === 'abandon') bump(abandon, (x.md || '') + '|' + x.at);
      if (x.ms >= 300) bump(slowOps, x.op);
    } else if (x.k === 'join') {
      if (x.sid && x.ok) S(x.sid).room = 1;
      if (!x.ok) bump(joins, x.how + '|' + x.e);
    } else if (x.k === 'disc') {
      if (x.why !== 'client namespace disconnect') bump(discWhy, x.why);
      if (x.why === 'ping timeout' || x.why === 'transport error') kpi.disc++;
      bump(discTr, x.tr || '?');
    } else if (x.k === 'slow') kpi.slow += x.n || 1;
    else if (x.k === 'step' && !x.partial) {
      const key = x.md + '|' + x.role;
      let g = steps.get(key);
      if (!g) steps.set(key, g = { md: x.md, role: x.role, dur: [], d: {} });
      g.dur.push(x.dur);
      for (const [k, v] of Object.entries(x.d || {})) (g.d[k] ||= []).push(v);
    } else if (x.k === 'cold') bump(cold, x.md + '|' + x.at + '|' + (x.role || ''));
    else if (x.k === 'c') {
      const s = x.sid ? S(x.sid) : {};
      if (x.br && !s.br) s.br = brOf(x);
      if (x.r) s.room = 1;
      if (/^(night|day|dawn)/.test(x.at || '') || x.game) s.game = 1;
      if (x.at === 'ended' || x.done) s.done = 1;
      if (x.e === 'boot') { s.boot = 1; if (x.ready) s.ready = 1; for (const k of Object.keys(boots)) if (x[k] > 0) boots[k].push(x[k]); }
      else if (x.e === 'fail') { kpi.fail++; s.boot = 1; bump(fails, x.why + '|' + brOf(x)); }
      else if (x.e === 'res') bump(res, (x.url || '?') + '|' + brOf(x));
      else if (x.e === 'net') { kpi.disc++; if (x.off > 0) offs.push(x.off); }
      else if (x.e === 'rtt') { (x.hist || []).forEach((v, i) => { if (i < hist.length) hist[i] += v; }); timeouts += x.to || 0; rttN += x.n || 0; }
      else if (x.e === 'toast') { const g = toast.get(x.text) || { n: 0, who: new Set() }; g.n++; g.who.add(x.sid); toast.set(x.text, g); }
      else if (x.e === 'rage') {
        kpi.rage++;
        const g = rage.get(x.sel) || { n: 0, who: new Set(), ats: new Map(), dis: 0 };
        g.n++; g.who.add(x.sid); bump(g.ats, String(x.at || 'lobby').replace(/\d+$/, '')); if (x.dis) g.dis++;
        rage.set(x.sel, g);
      } else if (x.e === 'jank') { jank.s.add(x.sid); jank.n += x.n || 0; jank.max = Math.max(jank.max, x.max || 0); }
    }
  }

  const splitKey = (m, names) => top(m, 30).map(([k, n]) => ({ ...Object.fromEntries(k.split('|').map((v, i) => [names[i], v])), n }));
  const devices = new Map();
  for (const s of sess.values()) if (s.br) { const d = devices.get(s.br) || { n: 0, bad: 0 }; d.n++; if (s.err) d.bad++; devices.set(s.br, d); }
  const all = [...sess.values()].filter(s => s.boot), fb = feedback(from);
  return {
    now, days, build: BUILD, kpi: { ...kpi, fb: fb.length },
    errors: [...errs.values()].sort((a, b) => b.last - a.last).sort((a, b) => b.n - a.n).slice(0, 40)
      .map(g => ({ ...g, who: g.who.size, rooms: [...g.rooms].slice(-6), br: top(g.br), builds: [...g.builds] })),
    refused: [...refused.values()].sort((a, b) => b.n - a.n).slice(0, 40)
      .map(g => ({ ...g, rooms: g.rooms.size, total: ops[g.op]?.n || g.n, ats: top(g.ats, 3), md: top(g.md, 3) })),
    joins: splitKey(joins, ['how', 'e']),
    rage: [...rage.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([sel, g]) => ({ sel, n: g.n, who: g.who.size, ats: top(g.ats, 3), dis: g.dis })),
    toast: [...toast.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([text, g]) => ({ text, n: g.n, who: g.who.size })),
    fails: splitKey(fails, ['why', 'br']),
    res: splitKey(res, ['url', 'br']),
    steps: [...steps.values()].map(g => ({ md: g.md, role: g.role, n: g.dur.length, p50: pct(g.dur, .5), p90: pct(g.dur, .9), max: Math.max(...g.dur),
      d: Object.fromEntries(Object.entries(g.d).map(([k, v]) => [k, pct(v, .5)])) })).sort((a, b) => b.p90 - a.p90),
    cold: splitKey(cold, ['md', 'at', 'role']),
    abandon: splitKey(abandon, ['md', 'at']),
    undo: splitKey(undo, ['md', 'u']),
    slowOps: top(slowOps, 10),
    net: {
      disc: top(discWhy, 8), tr: top(discTr, 4),
      off: { n: offs.length, p50: pct(offs, .5), p90: pct(offs, .9) },
      rtt: { n: rttN, hist, p50: histPct(hist, .5), p95: histPct(hist, .95), to: timeouts },
      boot: Object.fromEntries(Object.entries(boots).map(([k, v]) => [k, { n: v.length, p50: pct(v, .5), p90: pct(v, .9) }])),
      jank: { who: jank.s.size, n: jank.n, max: jank.max },
    },
    devices: [...devices.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 20).map(([br, d]) => ({ br, ...d })),
    funnel: [['打開', all.filter(s => s.boot).length], ['畫出來', all.filter(s => s.ready).length], ['進了房間', all.filter(s => s.room).length],
      ['開局', all.filter(s => s.game).length], ['看到結局', all.filter(s => s.done).length]],
    feedback: fb,
  };
}

// 一個房號前後一天的全部記錄（房號會回收，inst 分得出是哪個房間）。先按字符串篩，再解析
export function timeline(code, t = Date.now(), inst = '') {
  if (!/^\d{4}$/.test(code)) return [];
  const out = [], needle = `"r":"${code}"`;
  for (let d = t - DAY; day(d) <= day(t + DAY); d += DAY) {
    let text = '';
    try { text = fs.readFileSync(fileOf(day(d)), 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.includes(needle)) continue;
      try { const x = JSON.parse(line); if (x.r === code && (!inst || !x.i || x.i === inst)) out.push(x); } catch { /* 寫到一半 */ }
    }
  }
  // 反饋另存在 feedback.jsonl：同一個房號、同一段時間的也放進來
  for (const f of feedback(t - DAY)) if (f.r === code && f.t <= t + DAY) out.push({ k: 'fb', t: f.t, r: code, text: f.text });
  out.sort((a, b) => a.t - b.t);
  return out.length > 4000 ? out.slice(-4000) : out;
}

// 出錯時存的快照（給 /admin 下載）：只認 trace.js 起的那種文件名
export function crashFile(name) {
  if (!/^\d{8}T\d{6}-[\dx]{1,4}-[0-9a-f]{4}\.json$/.test(String(name))) return null;
  const f = path.join(CRASH, name);
  return fs.existsSync(f) ? f : null;
}
