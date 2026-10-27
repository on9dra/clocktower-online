// 壓測：模擬說書人 + 玩家整局遊戲（夜晚選人、給信息、白天提名、計票、聊天），逐步加房間，統計延遲和流量。
// 用法：URL=http://host:3000 node tests/load.js [最多房間數=200] [每批加幾個=10] [每批間隔秒=30] [每局玩家=12]
// 每 10 秒輸出一行 JSON：rooms 房間數，lat 操作到收到新狀態的延遲 p50/p95/max（毫秒），rx 客戶端每秒收到的字節，lag 本進程事件循環延遲
import { io } from 'socket.io-client';

const URL = process.env.URL || 'http://localhost:3000';
const [MAX = 200, BATCH = 10, EVERY = 30, PLAYERS = 12] = process.argv.slice(2).map(Number);
const TAG = process.env.TAG || 'lt';
const rnd = (a, b) => a + Math.random() * (b - a);
const later = (a, b, fn) => setTimeout(fn, rnd(a, b) * 1000);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

let rx = 0, lats = [], errors = 0, rooms = 0, games = 0;
const conn = () => {
  const s = io(URL, { forceNew: true, transports: ['websocket'], reconnection: true });
  s.io.on('open', () => s.io.engine.on('packet', p => { rx += typeof p.data === 'string' ? p.data.length : 0; }));
  return s;
};
// 發出操作，記下到收到下一次狀態推送的時間
function timed(s, ev, data) {
  const t = performance.now();
  s.once('state', () => lats.push(performance.now() - t));
  s.emit(ev, data, r => { if (r && !r.ok) errors++; });
}

function startRoom() {
  const st = conn();
  let code, last = '', plist = [];
  st.on('state', v => {
    const key = [v.seats.length, v.phase, v.night, v.day, v.st?.step?.id, v.st?.step?.status, v.st?.ruling ? 1 : 0, v.st?.virginCheck ? 1 : 0, v.nomination?.at, !!v.nomination?.clock].join('|');
    if (key === last) return;
    last = key;
    const op = o => timed(st, 'st:op', o);
    if (v.st?.ruling) return later(2, 4, () => op({ op: 'rule', work: v.st.ruling.forced ? v.st.ruling.auto : true }));
    if (v.st?.virginCheck) return later(2, 4, () => op({ op: 'virgin', work: v.st.virginCheck.auto }));
    if (v.phase === 'lobby' && v.seats.length >= PLAYERS) return later(3, 6, () => { games++; op({ op: 'next' }); });
    if (v.phase === 'ended') return later(5, 10, () => op({ op: 'next' }));
    if (v.phase === 'dawn') return later(5, 10, () => op({ op: 'next' }));
    const step = v.st?.step;
    if (v.phase === 'night' && step) {
      if (step.status === 'review') return later(3, 6, () => op({ op: 'dawn' }));
      if (step.status === 'decide') return later(3, 6, () => op({ op: 'decide', choice: step.decide.options[0].id }));
      if (step.status === 'confirm') return later(4, 8, () => {
        st.emit('st:op', { op: 'confirm', fields: step.form.truth }, r => { if (!r.ok) op({ op: 'skip' }); });
      });
    }
    if (v.phase === 'day') {
      if (v.nomination && !v.nomination.clock) return later(8, 15, () => op({ op: 'startCount' }));
      // 每天最多一次提名；計票結束後 / 沒人提名就討論一陣後結束白天
      if (!v.nomination) return later(v.history.length ? 8 : 40, v.history.length ? 15 : 60, () => op({ op: 'next' }));
    }
  });
  st.emit('st:create', {}, r => {
    code = r.code;
    for (let i = 0; i < PLAYERS; i++) plist.push(startPlayer(code, `${TAG}-${code}-${i}`, i));
  });
  rooms++;
}

function startPlayer(code, pid, i) {
  const s = conn();
  let step = null, nomAt = null, day = -1, me = null;
  s.on('connect', () => s.emit('pl:join', { code, pid, name: `${TAG}${i}` }, () => {}));
  s.on('state', v => {
    me = v.myId;
    if (v.prompt && v.prompt.stepId !== step) {
      step = v.prompt.stepId;
      const pool = v.seats.filter(x => !(v.prompt.notSelf && x.id === v.myId)).map(x => x.id).sort(() => Math.random() - 0.5);
      later(3, 10, () => timed(s, 'pl:act', { act: 'pick', ids: pool.slice(0, v.prompt.count) }));
    }
    // 白天：第一個座位的玩家在討論後提名一個活人
    if (v.phase === 'day' && v.day !== day) {
      day = v.day;
      if (i === 0) later(20, 35, () => {
        const t = pick(v.seats.filter(x => !x.dead && x.id !== me));
        if (t) timed(s, 'pl:act', { act: 'nominate', targetId: t.id });
      });
    }
    if (v.nomination?.clock && v.nomination.at !== nomAt) {
      nomAt = v.nomination.at;
      if (Math.random() < 0.6) later(0.5, 3, () => timed(s, 'pl:act', { act: 'vote', v: 'yes' }));
    }
  });
  // 偶爾打字聊天（語音在騰訊會議，文字聊天不多）
  const chat = () => { if (s.connected) timed(s, 'pl:act', { act: 'chat', to: 'all', text: '嗯 我覺得是他' }); setTimeout(chat, rnd(60, 120) * 1000); };
  setTimeout(chat, rnd(30, 120) * 1000);
  return s;
}

// 事件循環延遲：本進程忙不過來時延遲數據就不準了
let lag = 0, lastTick = performance.now();
setInterval(() => { const now = performance.now(); lag = Math.max(lag, now - lastTick - 100); lastTick = now; }, 100);

const pct = (a, p) => (a.length ? Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))]) : null);
setInterval(() => {
  const a = lats.sort((x, y) => x - y);
  console.log(JSON.stringify({ t: new Date().toISOString().slice(11, 19), rooms, games, ops: a.length, lat: [pct(a, 0.5), pct(a, 0.95), pct(a, 1)], rxKBs: Math.round(rx / 10240), errors, lag: Math.round(lag) }));
  lats = []; rx = 0; errors = 0; lag = 0;
}, 10000);

let planned = 0;
function batch() {
  for (let k = 0; k < BATCH && planned < MAX; k++, planned++) setTimeout(startRoom, k * 300);
  if (planned < MAX) setTimeout(batch, EVERY * 1000);
}
batch();
