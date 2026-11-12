// 局面預設：用規則引擎直接造出一局、推進到要看的那一步，存成服務器的房間存檔。rig.mjs 的 preset 命令調用它（每次一個新進程，用的是 rig 快照裏的代碼）。
// 也可以單獨跑：node tools/uitest/preset.mjs <代碼目錄> <數據目錄> [參數…]   代碼目錄裏要有 lib/ 和 public/js/roles.js；房間寫進 <數據目錄>/rooms/
// 參數（都是 鍵=值，順序隨意）：
//   script=tb|bmr|snv|<劇本 Json 路徑>    默認 tb
//   mode=online|many|one                線上 / 線下多設備 / 線下單設備，默認 online
//   n=7                                 人數（默認 7；給了 roles 就按 roles 的個數）
//   roles=imp,poisoner,chef,…           按座位順序指定全部角色（酒鬼寫成 drunk>chef：以為自己是廚師）
//   with=juggler,imp@3                  只指定幾個（@ 座位號，不寫就從 1 號往後放），其餘按規則抽
//   at=…                                停在哪：lobby | night2 | night2:imp | night1:dawn | day1 | day1:nominate=3>1 | day1:slay=3>1 | end:good
//   pick.<角色>[@第幾夜]=3,5[:角色]       那個角色選誰（座位號），不寫就自動選一組合規的（不選自己、惡魔不殺隊友）
//   dead=2,4                            到了目標再把這幾個人標成死亡
//   names=甲,乙,…   seed=1   pass=0（單設備第一夜保留「傳閱身份」那張卡）
// 輸出一行 JSON：房間號、說書人密鑰、座位表、停在哪一步、每台設備該寫的 localStorage 和網址。出錯時輸出 { error }
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [snap, data, ...argv] = process.argv.slice(2);
const opt = Object.fromEntries(argv.map(a => { const i = a.indexOf('='); return i < 0 ? [a, '1'] : [a.slice(0, i), a.slice(i + 1)]; }));
const fail = msg => { console.log(JSON.stringify({ error: msg })); process.exit(0); };
if (!snap || !data) fail('用法：preset.mjs <代碼目錄> <數據目錄> [參數…]');

// 固定隨機數：同一份代碼、同樣的參數，每次造出來的局一樣（抽角色、自動選人、紅鯡魚）
let seed = (Number(opt.seed) || 1) >>> 0;
Math.random = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

process.env.DATA_DIR = data;
const load = p => import(pathToFileURL(path.join(snap, p)).href);
const { createRoom } = await load('lib/store.js');
const { applyStOp, applyPlayerAction, joinPlayer } = await load('lib/ops.js');
const { autoPicks } = await load('lib/engine.js');
const { ROLES, SCRIPTS } = await load('public/js/roles.js');

const NAMES = (opt.names ? opt.names.split(',') : ['小明', '阿花', '老王', 'Kiki', '大熊', '莉莉', '阿杰', '豆豆', 'Tom', '小雨', '阿龍', '妮妮', '胖虎', '七七', '阿木']);
const room = createRoom();
const st = (op, args = {}) => applyStOp(room, { op, ...args });
const must = (r, what) => { if (typeof r === 'string') fail(`${what}：${r}`); return r; };
const seatN = n => room.seats[Number(n) - 1] || fail(`沒有 ${n} 號座位`);
// 自製劇本的角色 id 是上傳時編的（h<房間>_<n>），寫角色名也認
const byName = id => (ROLES[id] ? id : Object.keys(ROLES).find(k => ROLES[k].name === id) || id);
const roleOk = id => ROLES[byName(id)] || fail(`不認識的角色：${id}`);

// ───── 準備階段 ─────
const mode = opt.mode || 'online';
if (!['online', 'many', 'one'].includes(mode)) fail('mode 只能是 online / many / one');
must(st('venue', mode === 'online' ? { venue: 'online' } : { venue: 'offline', devices: mode }), '選模式');
const script = opt.script || 'tb';
if (Object.hasOwn(SCRIPTS, script) && script !== 'custom') must(st('script', { scriptId: script }), '選劇本');
else {
  const file = path.resolve(script);
  if (!fs.existsSync(file)) fail(`劇本不存在：${script}（內置的是 ${Object.keys(SCRIPTS).filter(k => k !== 'custom').join(' / ')}）`);
  must(st('upload', { entries: JSON.parse(fs.readFileSync(file, 'utf8')) }), '上傳劇本');
}
const roleList = opt.roles ? opt.roles.split(',').map(x => x.trim()).filter(Boolean) : null;
const n = roleList ? roleList.length : Number(opt.n) || 7;
if (mode === 'one') must(st('addSeats', { names: NAMES.slice(0, n) }), '加座位');
else for (let i = 0; i < n; i++) if (joinPlayer(room, `rig-p${i + 1}`, NAMES[i] || 'p' + (i + 1))) fail(`第 ${i + 1} 個玩家進不了房間`);
if (room.seats.length !== n) fail(`座位數不對：要 ${n} 個，實際 ${room.seats.length} 個`);
const setRole = (s, spec) => {
  const [real, fake] = spec.split('>').map(byName);
  roleOk(real); if (fake) roleOk(fake);
  must(st('setRole', { seatId: s.id, roleId: real, fakeRole: fake || undefined }), `${s.name} 指定 ${real}`);
};
if (roleList) roleList.forEach((r, i) => setRole(room.seats[i], r));
else {
  let next = 1;
  for (const w of (opt.with || '').split(',').map(x => x.trim()).filter(Boolean)) {
    const [r, at] = w.split('@');
    if (at) setRole(seatN(at), r);
    else { while (room.seats[next - 1]?.pinned) next++; setRole(seatN(next), r); }
  }
}

const target = parseTarget(opt.at || 'day1');
function parseTarget(t) {
  let m;
  if (t === 'lobby') return { kind: 'lobby' };
  if ((m = /^night(\d+)(?::([^\s:]+))?$/.exec(t))) return { kind: 'night', n: +m[1], role: m[2] ? byName(m[2]) : null };
  if ((m = /^day(\d+)(?::(nominate|slay)=(\d+)>(\d+))?$/.exec(t))) return { kind: 'day', n: +m[1], act: m[2] || null, from: m[3], to: m[4] };
  if ((m = /^end:(good|evil)$/.exec(t))) return { kind: 'end', team: m[1] };
  return fail(`at 看不懂：${t}（lobby | night2 | night2:imp | night1:dawn | day1 | day1:nominate=3>1 | day1:slay=3>1 | end:good）`);
}
if (target.kind === 'night' && target.role && target.role !== 'dawn') roleOk(target.role);

// pick.<角色>[@夜]=3,5[:角色]
const picks = {};
for (const [k, v] of Object.entries(opt)) {
  const m = /^pick\.([\w-]+)(?:@(\d+))?$/.exec(k);
  if (!m) continue;
  roleOk(m[1]);
  const [seats, role] = v.split(':');
  picks[m[1] + (m[2] ? '@' + m[2] : '')] = { seats: seats ? seats.split(',').filter(Boolean) : [], role: role || null };
}

// ───── 推進 ─────
const g = () => room.g;
const evilSeat = s => ['minion', 'demon'].includes(ROLES[s.role]?.team) || s.align === 'evil';
function choose(step) {
  const own = picks[`${step.roleId}@${g().night}`] || picks[step.roleId];
  if (own) {
    if (own.role) roleOk(own.role);
    return { ids: own.seats.map(x => seatN(x).id), role: own.role };
  }
  // 自動：隨機出幾組合規的，挑最「正常」的一組（不選自己；邪惡的不對隊友下手）
  const me = room.seats.find(s => s.id === step.seatId);
  let best = null, score = Infinity;
  for (let k = 0; k < 40; k++) {
    const c = autoPicks(room, step);
    if (c.stuck) continue;
    const bad = (c.ids.includes(step.seatId) ? 10 : 0) + (me && evilSeat(me) ? c.ids.filter(id => evilSeat(room.seats.find(s => s.id === id))).length * 5 : 0);
    if (bad < score) { best = c; score = bad; }
    if (!bad) break;
  }
  return best || { ids: [], role: null };
}
function pickStep(step) {
  const c = choose(step), seat = room.seats.find(s => s.id === step.seatId);
  // 線上局讓玩家自己在手機上選（和真人走同一條路），不行（說書人代點的步驟）才由說書人點
  if (mode === 'online' && seat && !seat.local) {
    const r = applyPlayerAction(room, seat.pid, { act: 'pick', ids: c.ids, role: c.role });
    if (typeof r !== 'string') return;
  }
  must(st('pick', c), `第 ${g().night} 夜 ${step.title || step.roleId} 選人`);
}
const reached = () => {
  const t = target;
  if (t.kind === 'lobby') return room.phase === 'lobby';
  if (t.kind === 'night') {
    if (room.phase !== 'night' || g().night !== t.n || !g().step) return false;
    if (!t.role) return true;
    if (t.role === 'dawn') return g().step.status === 'review';
    return g().step.roleId === t.role && g().step.status !== 'done';
  }
  return room.phase === 'day' && g().day === t.n;
};
const past = () => {
  const t = target, night = g().night, day = g().day;
  if (room.phase === 'ended') return '遊戲已經結束了（' + (room.winReason || room.winner) + '）';
  if (t.kind === 'night' && (night > t.n || (night === t.n && room.phase !== 'night'))) return `第 ${t.n} 夜過去了，沒有遇到 ${t.role || '那一步'}（場上有沒有這個角色、他是不是已經死了、今晚會不會醒？）`;
  if (t.kind === 'day' && day > t.n) return `第 ${t.n} 天過去了`;
  return null;
};

if (target.kind !== 'lobby') {
  if (!roleList && room.seats.some(s => !s.role)) must(st('draft'), '抽角色');
  must(st('next'), '開始遊戲');
}
for (let k = 0; !reached(); k++) {
  if (k > 800) fail('推進了 800 步還沒到，可能卡住了：' + JSON.stringify({ phase: room.phase, night: g().night, day: g().day, step: g().step && { roleId: g().step.roleId, status: g().step.status } }));
  const why = past(); if (why) fail(why);
  if (target.kind === 'end' && room.phase === 'day') break;
  if (g().notice?.length) { must(st('notice'), '告知卡'); continue; }
  if (room.phase === 'night') {
    const s = g().step;
    if (!s) fail('夜裏沒有步驟');
    if (s.status === 'fake') must(st('pretend'), '假裝叫醒');
    else if (s.status === 'choose') pickStep(s);
    else if (s.status === 'confirm') must(st('confirm', { fields: s.form.truth }), `${s.title} 給信息`);
    else if (s.status === 'decide') must(st('decide', { choice: s.decide.options[0].id }), `${s.title} 裁定`);
    else if (s.status === 'review') must(st('dawn'), '天亮');
    else must(st('ack'), `${s.title} 確認`);
  } else if (room.phase === 'dawn') must(st('next'), '天亮');
  else if (room.phase === 'day') {
    // 白天直接入夜：死後的選擇、裁定、貞潔者先處理掉
    const w = g().lastWords?.[0];
    if (w) must(st('word', { seatId: w.seatId, targetId: room.seats.find(s => !s.dead && s.id !== w.seatId)?.id || null }), '死後的選擇');
    else if (g().ruling) must(st('rule', { work: false }), '裁定');
    else if (g().virginCheck) must(st('virgin', { work: false }), '貞潔者');
    else must(st('next'), '結束白天');
  } else fail('意外的階段：' + room.phase);
}

// ───── 到了：目標上的動作 ─────
if (target.kind === 'day' && target.act) {
  const from = seatN(target.from), to = seatN(target.to);
  if (mode === 'online') must(applyPlayerAction(room, from.pid, { act: target.act === 'nominate' ? 'nominate' : 'slay', targetId: to.id }), target.act);
  else must(st(target.act === 'nominate' ? 'nominate' : 'slayFor', { fromId: from.id, toId: to.id }), target.act);
}
if (target.kind === 'end') must(st('win', { team: target.team }), '判定勝負');
for (const x of (opt.dead || '').split(',').filter(Boolean)) must(st('setDead', { seatId: seatN(x).id, dead: true }), `${x} 號死亡`);

// ───── 寫存檔、交代每台設備 ─────
const rooms = path.join(data, 'rooms');
fs.mkdirSync(rooms, { recursive: true });
for (const f of fs.readdirSync(rooms)) fs.rmSync(path.join(rooms, f), { force: true, recursive: true }); // 一次只放一個局面：服務啓動快，房間號不會撞
fs.writeFileSync(path.join(rooms, room.code + '.json'), JSON.stringify(room));

const step = g().step, nameOf = id => ROLES[id]?.name || id || '';
const actor = room.phase === 'night' && step?.seatId ? room.seats.findIndex(s => s.id === step.seatId) + 1 : null;
const url = `/?room=${room.code}&r=${room.inst}`;
const devices = { st: { url, ls: { [`botc.st.${room.code}`]: room.stKey, ...(mode === 'one' && opt.pass !== '0' && room.gameId && { [`botc.passed.${room.code}.${room.gameId}`]: '1' }) } } };
// debug=1：說書人這台勾著「調試模式」（rig 要帶環境變量起：BOTC_DEBUG=1 node tools/uitest/rig.mjs …，服務器才認）；as=3：一打開就代入 3 號
if (opt.debug === '1' || opt.as) Object.assign(devices.st.ls, { 'botc.debug': '1' }, opt.as && { [`botc.dbg.as.${room.code}`]: seatN(opt.as).id });
if (mode !== 'one') room.seats.forEach((s, i) => { devices['p' + (i + 1)] = { url, ls: { 'botc.pid': s.pid, 'botc.name': s.name } }; });
console.log(JSON.stringify({
  code: room.code, inst: room.inst, stKey: room.stKey, gameId: room.gameId || null, mode, script: room.scriptId,
  phase: room.phase, night: g().night, day: g().day, actor,
  step: room.phase === 'night' && step ? `${step.title || nameOf(step.roleId)}（${step.status}）` : null,
  nomination: room.nomination ? `${room.seats.findIndex(s => s.id === room.nomination.nominatorId) + 1} 提名 ${room.seats.findIndex(s => s.id === room.nomination.nomineeId) + 1}` : null,
  ruling: g().ruling?.kind || null, winner: room.winner || null,
  seats: room.seats.map((s, i) => `${i + 1} ${s.name || '（空）'} ${nameOf(s.role)}${s.fakeRole ? '(以為是' + nameOf(s.fakeRole) + ')' : ''}${s.dead ? ' ✝' : ''}`),
  devices,
}));
