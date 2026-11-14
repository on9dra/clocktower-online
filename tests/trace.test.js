// 後台日誌：操作、出錯快照、夜裏每一步的耗時、瀏覽器上報、彙總和房間時間線，再起一個真服務器走一遍。用法：node tests/trace.test.js
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { io } from 'socket.io-client';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-trace-'));
process.env.DATA_DIR = DATA;
const trace = await import('../lib/trace.js');
const { issues, timeline, crashFile } = await import('../lib/issues.js');
const { roomPage } = await import('../lib/admin-issues.js');
const { setup, S } = await import('./helpers.js');
const { applyStOp } = await import('../lib/ops.js');
const lines = d => fs.readFileSync(trace.fileOf(d), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const today = trace.day(Date.now());

// 參數：座位 id 換成座位號，文字只留長度，長的截斷
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier']);
  const a = trace.clean(r, { op: 'pick', ids: [r.seats[2].id, r.seats[4].id], text: '我覺得三號是惡魔', pass: '1234', roleId: 'imp', long: 'x'.repeat(50) });
  assert.deepStrictEqual(a.ids, ['#3', '#5']);
  assert.strictEqual(a.text, '‹8›');
  assert.strictEqual(a.pass, '‹4›');
  assert.strictEqual(a.roleId, 'imp');
  assert.ok(a.long.length <= 33);
  assert.ok(!('op' in a));
  assert.strictEqual(trace.who(r, { st: true }), 'st');
  assert.strictEqual(trace.who(r, { pid: r.seats[1].pid }), 2);
  assert.strictEqual(trace.who(r, { st: true, as: r.seats[3].id }), 'st>4');
}

// 被拒的操作記原因和在哪一步點的；出錯存操作前的快照，文件名認得出來，replay 能復現
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier']);
  const before = trace.where(r);
  const res = applyStOp(r, { op: 'kill', seatId: 'nope' });
  trace.op(r, { by: 'st', kind: 'st', o: { op: 'kill', seatId: 'nope' }, before, r: res, ms: 3.4 });
  const snap = trace.freeze(r);
  trace.fail('op', new Error('壞了 12 次'), { room: r, before: snap, o: { op: 'boom', text: '秘密' }, by: 'st' });
  trace.flushSync();
  const recs = lines(today);
  const op = recs.find(x => x.k === 'op');
  assert.strictEqual(op.ok, false);
  assert.strictEqual(op.e, res);
  assert.strictEqual(op.at, 'dawn0');
  const err = recs.find(x => x.k === 'err');
  assert.ok(err.snap && crashFile(err.snap), '快照存了，名字認得出');
  assert.strictEqual(crashFile('../../etc/passwd'), null);
  const saved = JSON.parse(fs.readFileSync(crashFile(err.snap), 'utf8'));
  assert.strictEqual(saved.room.code, r.code);
  assert.strictEqual(saved.meta.o.text, '‹2›', '聊天、文字不進快照');
  assert.deepStrictEqual(saved.room.chat, []);
  // 同一個錯誤對象只記一次（handle 的兜底再報一次不重複）
  const e = new Error('一次');
  trace.fail('op', e, {}); trace.fail('handler', e, {});
  trace.flushSync();
  assert.strictEqual(lines(today).filter(x => x.msg === '一次').length, 1);
}

// 階段和夜裏每一步：換步、換狀態時記上一段用了多久；重啓後看到的第一步是 partial
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier']);
  let now = 1e12;
  const real = Date.now;
  Date.now = () => now;
  try {
    r.phase = 'night'; r.g.night = 2;
    r.g.step = { id: 'a', roleId: 'monk', seatId: S(r, 'monk').id, status: 'choose' };
    trace.track(r); // 第一次看到：從半路算
    now += 5000; r.g.step = { id: 'b', roleId: 'imp', seatId: S(r, 'imp').id, status: 'choose' };
    trace.track(r);
    now += 40000; r.g.step = { ...r.g.step, id: 'c', status: 'ack' }; trace.track(r); // 選完人換了個 id 等確認：還是同一步
    now += 3000; r.g.step = null; r.phase = 'day'; r.g.day = 2; trace.track(r);
  } finally { Date.now = real; }
  trace.flushSync();
  const recs = lines(trace.day(1e12));
  const steps = recs.filter(x => x.k === 'step' && x.r === r.code);
  assert.strictEqual(steps.length, 2);
  assert.ok(steps[0].partial);
  assert.deepStrictEqual(steps[1].d, { choose: 40000, ack: 3000 });
  assert.strictEqual(steps[1].seat, 2);
  const ph = recs.find(x => x.k === 'phase' && x.r === r.code);
  assert.strictEqual(ph.from, 'night2'); assert.strictEqual(ph.at, 'day2'); assert.strictEqual(ph.dur, 48000);
}

// 瀏覽器：認得出微信、安卓 Chrome、iOS Safari
assert.deepStrictEqual(trace.browser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.47'), { br: '微信', os: 'iOS 17' });
assert.deepStrictEqual(trace.browser('Mozilla/5.0 (Linux; Android 14; 23013RK75C) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36'), { br: 'Chrome 130', os: 'Android 14' });
assert.deepStrictEqual(trace.browser('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'), { br: 'Safari 16', os: 'iOS 16' });
assert.deepStrictEqual(trace.browser('Mozilla/5.0 (Linux; Android 12; V2134A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Mobile Safari/537.36 VivoBrowser/14.1.0.2'), { br: 'vivo瀏覽器 · 內核87', os: 'Android 12' });

// 瀏覽器上報：只收認得的種類和字段，時間按服務器的鐘換算，玩家標識只留摘要
{
  const now = Date.now();
  assert.strictEqual(trace.ingest('不是 json', ''), '格式不對');
  assert.strictEqual(trace.ingest(JSON.stringify({ sid: 'x', ev: [] }), ''), '格式不對');
  const n = trace.ingest(JSON.stringify({ sid: 'abc123def', pid: 'player-1', now: now - 60000, ev: [
    { e: 'err', t: now - 61000, msg: 'x is not defined', src: '/js/town.js:12:3', stack: 'ReferenceError\n at /js/town.js:12:3', r: '1234', at: 'night1', st: 0, seat: 3, evil: 'drop me' },
    { e: 'rage', t: now - 60500, sel: 'button.btn "下一步"', cnt: 4, dis: true, r: '1234', at: 'day1' },
    { e: 'boot', t: now - 60000, ready: 2300, conn: 800, w: 375, h: 664 },
    { e: 'hack', t: now },
  ] }), 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36', now);
  assert.strictEqual(n, 3);
  trace.flushSync();
  const got = lines(today).filter(x => x.k === 'c' && x.sid === 'abc123def');
  assert.strictEqual(got.length, 3);
  const err = got.find(x => x.e === 'err');
  assert.strictEqual(err.t, now - 1000, '按服務器的鐘');
  assert.ok(!('evil' in err));
  assert.strictEqual(err.u, trace.tag('player-1'));
  assert.strictEqual(err.br, 'Chrome 131');
  assert.strictEqual(got.find(x => x.e === 'rage').dis, 1);
  assert.ok(got.find(x => x.e === 'boot').ua, '打開的那條帶完整 UA');
  assert.ok(!err.ua);
}

// 彙總和時間線
{
  const I = issues(1);
  assert.ok(I.errors.some(g => g.side === '服務器' && g.samples.some(x => x.snap)));
  assert.ok(I.errors.some(g => g.side === '前端' && g.at === '/js/town.js:12'));
  assert.ok(I.refused.some(g => g.op === 'kill'));
  assert.strictEqual(I.rage[0].sel, 'button.btn "下一步"');
  assert.ok(I.funnel[0][1] >= 1);
  assert.ok(I.devices.some(d => d.br.startsWith('Chrome 131') && d.bad === 1));
  // 同一類錯誤（只差數字）歸一行
  trace.fail('op', new Error('壞了 99 次'), {});
  trace.flushSync();
  assert.strictEqual(issues(1).errors.find(g => g.msg.startsWith('壞了')).n, 2);
  const tl = timeline('1234');
  assert.ok(tl.some(x => x.e === 'err') && tl.some(x => x.e === 'rage'));
  const html = roomPage({ code: '1234', t: Date.now(), inst: '', recs: tl });
  assert.ok(html.includes('前端出錯') && html.includes('連點'));
}

// 30 天前的日誌刪掉
{
  const old = trace.day(Date.now() - 40 * 86400e3);
  fs.writeFileSync(trace.fileOf(old), '{}\n');
  trace.prune();
  assert.ok(!fs.existsSync(trace.fileOf(old)));
  assert.ok(fs.existsSync(trace.fileOf(today)));
}

// replay：拿快照復現
{
  const snap = issues(1).errors.find(g => g.side === '服務器' && g.samples.some(x => x.snap)).samples.find(x => x.snap).snap;
  const out = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'replay.mjs'), crashFile(snap)], { encoding: 'utf8', windowsHide: true });
  assert.ok(/房間/.test(out.stdout), out.stderr);
}

// 真服務器：進房失敗、被拒的操作、斷線、瀏覽器上報都進日誌；/admin 的問題頁和時間線要密鑰
{
  const SRV = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-trace-srv-'));
  fs.writeFileSync(path.join(SRV, 'admin.key'), 'k'.repeat(32));
  const PORT = 4300 + Math.floor(Math.random() * 300), URL = `http://127.0.0.1:${PORT}`;
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT, DATA_DIR: SRV, RATE_LIMIT: '0' }, windowsHide: true });
  try {
    // 機器忙的時候（別的會話在跑測試台、瀏覽器）服務器起得慢：多等一會兒，起不來就說清楚為什麼
    let errOut = '';
    child.stderr.on('data', d => { errOut = (errOut + d).slice(-600); });
    await new Promise((res, rej) => {
      child.stdout.on('data', d => /已啓動/.test(d) && res());
      child.on('exit', code => rej(new Error(`測試服務器退出了（${code}）：${errOut}`)));
      setTimeout(() => rej(new Error(`測試服務器 30 秒沒起來：${errOut}`)), 30000).unref();
    });
    const call = (s, ev, d) => new Promise((r, j) => s.timeout(10000).emit(ev, d, (e, x) => (e ? j(new Error(`${ev} 10 秒沒回音`)) : r(x))));
    const st = io(URL, { auth: { sid: 'srvtest01' }, transports: ['websocket'] });
    const made = await call(st, 'st:create', {});
    assert.ok(made.ok);
    const bad = await call(st, 'st:op', { op: 'kill', seatId: 'nope' });
    assert.ok(!bad.ok);
    const p = io(URL, { auth: { sid: 'srvtest02' }, transports: ['websocket'] });
    assert.ok(!(await call(p, 'pl:join', { code: '0000', pid: 'pp', name: 'x' })).ok);
    assert.ok((await call(p, 'pl:join', { code: made.code, inst: made.inst, pid: 'pp', name: 'x' })).ok);
    p.close();
    const r = await fetch(URL + '/api/diag', { method: 'POST', body: JSON.stringify({ sid: 'srvtest02', now: Date.now(), ev: [{ e: 'toast', t: Date.now(), text: '房間不存在' }] }) });
    assert.strictEqual(r.status, 204);
    await new Promise(r => setTimeout(r, 1300)); // 日誌攢一秒寫一次
    assert.strictEqual((await fetch(URL + '/admin/issues?key=wrong')).status, 404);
    const I = await (await fetch(URL + '/admin/issues?days=1&key=' + 'k'.repeat(32))).json();
    assert.ok(I.refused.some(g => g.op === 'kill'), '被拒的操作');
    assert.ok(I.joins.some(j => j.e === '房間不存在'), '進房失敗');
    assert.ok(I.toast.some(t => t.text === '房間不存在'), '瀏覽器上報');
    assert.ok(I.net.tr.some(([t]) => t === 'websocket'), '斷線（自己離開的不算進斷線原因，傳輸方式照記）');
    const page = await (await fetch(`${URL}/admin/room?r=${made.code}&key=${'k'.repeat(32)}`)).text();
    assert.ok(page.includes('kill') && page.includes('進房'));
    const admin = await (await fetch(`${URL}/admin?key=${'k'.repeat(32)}`)).text();
    assert.ok(admin.includes('問題'));
    st.close();
  } finally { child.kill(); }
}

console.log('後台日誌 ✔');
