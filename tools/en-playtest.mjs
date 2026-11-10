// 英文版回歸試玩：服務器在本進程裏起（直接讀房間狀態），說書人頁（1280×800）+ 一名玩家手機頁（375×664）是無頭 Chrome、界面英文，
// 其餘座位用 socket 代打。每局把玩家 Alice 定成列表裏的下一個角色；輪到她選人時在手機上真的點座位和 Confirm（演出擋著就等）。
// 兩頁上 tr() 沒翻到的（window.__trMiss，帶它切出來的整句）和頁面上殘留的中文都打印出來，截圖存在 en-shots-<劇本>/。
// 用法：node tools/en-playtest.mjs <tb|bmr|snv> <人數> <角色,角色,...> [端口]   需要 Chrome；CHROME 環境變量可改路徑
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = new URL('..', import.meta.url).href;
const [SCRIPT = 'bmr', N = '10', ROLESARG = '', PORT = '3117'] = process.argv.slice(2);
const MYROLES = ROLESARG.split(',').filter(Boolean), GAMES = MYROLES.length || 1;
process.env.PORT = PORT; process.env.RATE_LIMIT = '0';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'endata-'));
const OUT = join(tmpdir(), (process.env.TAG || 'en-shots-') + SCRIPT); mkdirSync(OUT, { recursive: true });
const imp = p => import(ROOT + p);
await imp('server.js');
const store = await imp('lib/store.js');
const { io } = createRequire(new URL('package.json', ROOT))('socket.io-client');
const BASE = `http://localhost:${PORT}`;
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
const rand = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);

// ---------- Chrome ----------
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', DBG = 9400 + Math.floor(Math.random() * 400);
const prof = mkdtempSync(join(tmpdir(), 'enchrome-'));
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--mute-audio', '--no-proxy-server', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let ver;
for (let i = 0; i < 60 && !ver; i++) { await sleep(250); try { ver = await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json(); } catch { } }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(ok => { ws.onopen = ok; });
let cid = 0; const wait = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
const cdp = (method, params = {}, sessionId) => new Promise(ok => { const i = ++cid; wait.set(i, ok); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
async function page(w, hgt, mobile) {
  const { result: { browserContextId } } = await cdp('Target.createBrowserContext');
  const { result: { targetId } } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
  const { result: { sessionId } } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  const P = {
    s: sessionId,
    cmd: (m, p) => cdp(m, p, sessionId),
    async js(expr) { const r = await P.cmd('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; },
    async shot(name) { const r = await P.cmd('Page.captureScreenshot', { format: 'png' }); if (r.result) writeFileSync(join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); },
    async go(url) { await P.cmd('Page.navigate', { url }); },
  };
  await P.cmd('Page.enable'); await P.cmd('Runtime.enable');
  await P.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: hgt, deviceScaleFactor: 1, mobile });
  if (mobile) await P.cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await P.go(BASE + '/favicon.ico');
  await sleep(300);
  return P;
}
const ST = await page(1280, 800, false), PL = await page(375, 664, true);
const MISS = new Map(); // 文本 → 在哪兒看到
async function collect() {
  for (const [P, who] of [[ST, 'st'], [PL, 'pl']]) {
    const m = await P.js('return window.__trMiss ? [...window.__trMiss].map(t=>t+"  ⟵ "+(window.__trFrom.get(t)||"")) : []');
    for (const t of m || []) if (!MISS.has(t)) { MISS.set(t, who); console.log('MISS', who, JSON.stringify(t)); }
    // 頁面上殘留的中文（沒經過 tr() 的）
    const left = await P.js(`const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const o=new Set();let n;while(n=w.nextNode()){const t=n.nodeValue.trim();if(/\\p{Script=Han}/u.test(t)&&n.parentElement&&n.parentElement.offsetParent!==null)o.add(t.slice(0,120));}return [...o]`);
    for (const t of left || []) if (!MISS.has('DOM:' + t)) { MISS.set('DOM:' + t, who); console.log('DOM', who, JSON.stringify(t)); }
  }
}

// ---------- 開房 ----------
const stSock = io(BASE, { transports: ['websocket'] });
const emit = (s, ev, d) => new Promise(ok => s.emit(ev, d, ok));
const { code, stKey, inst } = await emit(stSock, 'st:create', {});
const op = async o => { const r = await emit(stSock, 'st:op', o); if (!r.ok) console.log('op fail', o.op, r.error); return r; };
await op({ op: 'venue', venue: 'online' });
await op({ op: 'script', scriptId: SCRIPT });
const room = store.get(code);
console.log('room', code, 'shots →', OUT);

await ST.js(`localStorage.setItem('botc.lang','en');localStorage.setItem('botc.intro','1');return 1`);
await PL.js(`localStorage.setItem('botc.lang','en');localStorage.setItem('botc.name','Alice');localStorage.setItem('botc.intro','1');return 1`);
await ST.go(`${BASE}/?room=${code}&st=${stKey}`);
await sleep(1500);
await PL.go(`${BASE}/?room=${code}&r=${inst}`);
await sleep(4000);
const bots = [];
for (let i = 0; i < +N - 1; i++) {
  const s = io(BASE, { transports: ['websocket'] });
  const pid = 'bot' + i;
  const r = await emit(s, 'pl:join', { code, inst, pid, name: ['Bob', 'Cara', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana', 'Ivy', 'Jon', 'Kim', 'Lee', 'Max', 'Ned', 'Ora'][i] });
  if (!r.ok) console.log('join fail', r.error);
  bots.push({ s, pid });
}
await sleep(2500);
const me = () => room.seats.find(s => s.name === 'Alice');
const botOf = seat => bots.find(b => b.pid === seat.pid);
await collect();
await ST.shot('0-lobby-st'); await PL.shot('0-lobby-pl');

// 玩家手機：像真人一樣點。找到座位頭像 / 按鈕，點中心
async function tap(P, sel, text) {
  let r;
  for (let k = 0; k < 20; k++) { r = await hit(P, sel, text); if (!r || r.ok) break; await sleep(500); } // 演出擋著就等它播完，像真人一樣
  if (!r) return false;
  if (!r.ok) console.log('tap blocked', sel, text, r.what);
  for (const type of ['mousePressed', 'mouseReleased']) await P.cmd('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
}
async function hit(P, sel, text) {
  return await P.js(`const els=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.offsetParent!==null${text ? `&&e.textContent.includes(${JSON.stringify(text)})` : ''});
    const e=els[0]; if(!e) return null; const b=e.getBoundingClientRect(); const x=b.x+b.width/2,y=b.y+b.height/2;
    const hit=document.elementFromPoint(x,y); return {x,y,ok:!!hit&&(hit===e||e.contains(hit)), what:hit&&hit.className}`);
}

// ---------- 夜晚 ----------
const truthy = f => (!f.vortox ? f.truth : f.kind === 'number' ? { n: (f.truth.n + 1) % (f.max + 1) } : f.kind === 'yesno' ? { yes: !f.truth.yes } : f.truth);
let shotN = 0, seenRoles = new Set(), TAPPED = 0;
async function stepOnce() {
  const g = room.g, step = g.step;
  if (!step) return false;
  const tag = `${g.night}-${step.roleId}-${step.status}`;
  if (step.status === 'review') { await sleep(800); await collect(); await op({ op: 'dawn' }); return true; }
  if (step.status === 'fake') { await op({ op: 'pretend' }); return true; }
  if (step.status === 'ack') { await sleep(900); await collect(); await op({ op: 'ack' }); return true; }
  if (step.status === 'choose') {
    const c = step.choose, counts = c.counts || [c.count], last = c.last || [];
    const mine = step.seatId === me()?.id;
    if (mine) {
      await sleep(3000); await collect();
      const pool0 = shuffle(room.seats.filter(s => !(c.notSelf && s.id === step.seatId) && !(c.alive && s.dead) && !(c.dead && !s.dead) && !last.includes(s.id)));
      const want = Math.min(...counts.filter(n => n > 0 && n <= pool0.length));
      if (!c.roles && isFinite(want)) {
        for (const t of pool0.slice(0, want)) { await tap(PL, `.ring > [data-key="${t.id}"] .seat-token`); await sleep(500); }
        await sleep(600); await collect();
        await PL.shot(`n${g.night}-${step.roleId}-pl-choose`);
        await tap(PL, '.turn-pane button', 'Confirm');
        await sleep(1500);
        if (step.status !== 'choose' || room.g.step !== step) { console.log('tapped', step.roleId, 'ok'); TAPPED++; return true; }
        console.log('tap pick failed', step.roleId);
      } else await PL.shot(`n${g.night}-${step.roleId}-pl-choose`);
    }
    const pool = shuffle(room.seats.filter(s => !(c.notSelf && s.id === step.seatId) && !(c.alive && s.dead) && !(c.dead && !s.dead) && !last.includes(s.id)));
    const k = Math.max(0, Math.min(...counts.filter(n => n <= pool.length)));
    const role = c.roles && !(c.roleOptional && Math.random() < .3) ? rand(c.roles) : null;
    const seat = room.seats.find(s => s.id === step.seatId);
    const b = seat && botOf(seat);
    const ids = pool.slice(0, isFinite(k) ? k : 0).map(s => s.id);
    if (b) { const r = await emit(b.s, 'pl:act', { act: 'pick', ids, role }); if (!r.ok) { console.log('bot pick fail', step.roleId, r.error); await op({ op: 'pick', ids, role }); } }
    else await op({ op: 'pick', ids, role });
    if (room.g.step === step && step.status === 'choose') await op({ op: 'skip' });
    return true;
  }
  if (step.status === 'decide') {
    if (!seenRoles.has(tag)) { await sleep(900); await collect(); }
    const opts = step.decide.options || [];
    await op({ op: 'decide', choice: rand(opts)?.id });
    return true;
  }
  if (step.status === 'confirm') {
    await sleep(900); await collect();
    if (shotN++ < 40 && !seenRoles.has(step.roleId)) await ST.shot(`n${g.night}-${step.roleId}-st-confirm`);
    seenRoles.add(step.roleId);
    const r = await op({ op: 'confirm', fields: truthy(step.form) });
    if (!r.ok) await op({ op: 'skip' });
    if (step.seatId === me()?.id) { await sleep(3500); await collect(); await PL.shot(`n${g.night}-${step.roleId}-pl-info`); }
    return true;
  }
  if (step.status === 'mark') { await op({ op: 'markPick', ids: [] }); if (room.g.step === step) await op({ op: 'skip' }); return true; }
  await op({ op: 'skip' });
  return true;
}

async function night() {
  for (let i = 0; i < 200 && room.phase === 'night'; i++) {
    const before = JSON.stringify([room.g.step?.id, room.g.step?.status]);
    await stepOnce();
    await sleep(250);
    if (JSON.stringify([room.g.step?.id, room.g.step?.status]) === before && room.phase === 'night') { console.log('stuck', before); await op({ op: 'skip' }); }
  }
}
async function day() {
  await sleep(2500); await collect();
  for (let k = 0; k < 6 && room.phase === 'day'; k++) {
    for (const w of [...(room.g.lastWords || [])]) {
      const target = rand(room.seats.filter(s => !s.dead && s.id !== w.seatId));
      const seat = room.seats.find(s => s.id === w.seatId), b = botOf(seat);
      if (b && !w.st) await emit(b.s, 'pl:act', { act: 'pick', ids: [target.id] }).then(r => r.ok || op({ op: 'word', seatId: w.seatId, targetId: target.id }));
      else { if (seat === me()) { await sleep(2000); await collect(); await PL.shot(`d${room.g.night}-pl-word`); } await op({ op: 'word', seatId: w.seatId, targetId: target.id }); }
    }
    if (room.g.ruling) { await sleep(800); await collect(); await op({ op: 'rule', work: Math.random() < .5 }); }
    if (room.g.virgin || room.nomination?.virgin) await op({ op: 'virgin', work: Math.random() < .5 });
    if (room.phase !== 'day' || room.g.lastWords?.length) continue;
    if (!room.g.dayOver && !room.nomination && k === 0) {
      const alive = room.seats.filter(s => !s.dead);
      const from = rand(alive.filter(s => botOf(s))), to = rand(room.seats.filter(s => s !== from));
      const r = await emit(botOf(from).s, 'pl:act', { act: 'nominate', targetId: to.id });
      if (!r.ok) console.log('nominate fail', r.error);
      await sleep(1500);
      if (room.nomination) {
        // 玩家手機舉手：點真界面
        await collect(); await PL.shot(`d${room.g.night}-pl-vote`);
        await tap(PL, 'button', 'Raise') || await tap(PL, 'button', 'Yes');
        for (const b of bots) if (Math.random() < .6) await emit(b.s, 'pl:act', { act: 'vote', v: 'yes' });
        await sleep(800); await collect();
        await op({ op: 'closeVote' });
        await sleep(1500); await collect();
      }
    }
    await op({ op: 'next' });
    await sleep(1500);
  }
}

for (let gi = 0; gi < +GAMES; gi++) {
  seenRoles = new Set();
  if (room.phase !== 'lobby') await op({ op: 'next' }); // ended → lobby
  if (gi) { await PL.go(`${BASE}/?room=${code}&r=${inst}`); await ST.go(`${BASE}/?room=${code}`); await sleep(3500); }
  await op({ op: 'shuffleSeats' });
  await sleep(500);
  if (MYROLES[gi]) { for (const x of room.seats) if (x.pinned) await op({ op: 'unpin', seatId: x.id }); const r = await op({ op: 'setRole', seatId: me().id, roleId: MYROLES[gi] }); }
  const r = await op({ op: 'next', force: true });
  console.log('game', gi, 'start', r.ok, room.seats.map(s => s.name + ':' + s.role).join(' '));
  await sleep(2500); await collect();
  await PL.shot(`g${gi}-${MYROLES[gi]||''}-pl-role`);
  if (process.env.PROBE) { await sleep(4000); console.log('PROBE', await PL.js(process.env.PROBE)); await PL.shot('probe'); }
  for (let d = 0; d < 4 && room.phase !== 'ended' && room.phase !== 'lobby'; d++) {
    if (room.phase === 'night') await night();
    if (room.phase === 'dawn') await op({ op: 'dawn' });
    if (room.phase === 'day') { if (d === 1) { await ST.shot(`g${gi}-d-st`); await PL.shot(`g${gi}-d-pl`); } await day(); }
  }
  if (room.phase !== 'ended') await op({ op: 'win', team: Math.random() < .5 ? 'good' : 'evil' });
  for (const t of [3500, 3500, 4000, 6000]) { await sleep(t); await PL.shot(`g${gi}-end-pl-${t}-${Date.now() % 100000}`); }
  await collect();
  await ST.shot(`g${gi}-end-st`); await PL.shot(`g${gi}-end-pl`);
  console.log('game', gi, 'end', room.winner);
}
await collect();
writeFileSync(join(OUT, 'miss.json'), JSON.stringify([...MISS], null, 1));
console.log('TOTAL MISS', MISS.size, 'TAPPED', TAPPED);
proc.kill(); process.exit(0);
