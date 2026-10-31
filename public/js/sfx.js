// 演出音效：除了入夜的鐘都放錄音（public/sfx），鐘用 Web Audio 現場合成；錄音沒載完、解不開時也放合成聲。默認開，頂欄喇叭一鍵靜音；「⋯ → 設置」裏還有音量、煙花、煙花聲（都記在本機）
let ac = null, master = null, bus = null;
// 有錄音的音效：public/sfx/<名字>.m4a，蓋掉 SOUNDS 裏的同名合成聲，響度寫在文件裏（tools/sfx-build.py）。
// 實物聲每次音高隨機浮動一點，連著響才不像複製粘貼；樂器音的音高不動
const WOBBLE = {};
const sampled = (names, wobble) => names.split(' ').forEach(n => { WOBBLE[n] = wobble; });
sampled('dun dunBig dunLow objection flop pass fail good evil dawn crown turn key bell hum shimmer', 0);
sampled('stab slash thud clang crack zap rope twang miss gavel rumble demon flip page leaf clip rattle cork unlock tock tick '
  + 'whoosh swish toss splat caw flap dig splash drip fire fw hiss smack sniff beat2 pop', 0.08);
const buffers = {}, waiting = Object.keys(WOBBLE);
let downloading = 0;
// 服務器帶寬只有 2Mbps 上下，一次下三個，不和圖片搶
function pump() {
  while (downloading < 3 && waiting.length) {
    const name = waiting.shift();
    downloading++;
    fetch(`sfx/${name}.m4a`).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(b => ac.decodeAudioData(b)).then(b => { buffers[name] = b; }).catch(() => { /* 退回合成聲 */ })
      .finally(() => { downloading--; pump(); });
  }
}
const LS = 'botc.mute', PREFS = 'botc.sfx';
export const muted = () => { try { return localStorage.getItem(LS) === '1'; } catch { return false; } };
export function setMuted(v) { try { localStorage.setItem(LS, v ? '1' : ''); } catch { /* 忽略 */ } }
// 設置：vol 音量 0–1；fw 煙花；fwSound 煙花聲
const DEF = { vol: 0.8, fw: true, fwSound: true };
export function prefs() { try { return { ...DEF, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { ...DEF }; } }
export function setPref(k, v) {
  const p = { ...prefs(), [k]: v };
  try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch { /* 忽略 */ }
  if (master) master.gain.value = 0.6 * p.vol;
}

// 瀏覽器要求有過用戶操作才能出聲：第一次點擊時建立
function ctx() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ac = new C();
    master = ac.createGain();
    master.gain.value = 0.6 * prefs().vol;
    master.connect(ac.destination);
    pump();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
document.addEventListener('pointerdown', () => ctx(), { once: true });
// 開屏的鐘第一下就要出聲，提前建好（起來要一小會兒）
export const wake = () => { ctx(); };
// 瀏覽器還不讓出聲（這一頁沒點過），又沒靜音：開屏要等用戶點一下
export const locked = () => !muted() && !!ctx() && ac.state !== 'running';
// 等聲音環境真的起來再敲，第一下不被吃掉。不讓出聲時 resume 一直掛著，超時就算了，不能等以後點一下才補響
export function chime(name, within) {
  const a = ctx();
  if (!a) return Promise.resolve();
  return Promise.race([a.resume(), new Promise(ok => setTimeout(ok, within))]).then(() => play(name));
}

function tone(freq, { at = 0, dur = 0.3, type = 'sine', vol = 0.4, to, attack = 0.005 } = {}) {
  const a = ac, t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus || master);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise({ at = 0, dur = 0.3, vol = 0.4, freq = 1200, q = 0.8, type = 'bandpass', to } = {}) {
  const a = ac, t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf;
  f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus || master);
  src.start(t);
}
// 鐘聲：幾個不成整數倍的泛音
const bell = (f, at = 0, vol = 0.35) => [1, 2.76, 5.4, 8.9].forEach((k, i) => tone(f * k, { at, dur: 2.6 / (i + 1), vol: vol / (i + 1.5), attack: 0.002 }));

const SOUNDS = {
  night: () => { bell(196); bell(196, 0.9, 0.25); },
  dawn: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.9, type: 'triangle', vol: 0.18 })),
  whoosh: () => noise({ dur: 0.35, freq: 400, to: 2400, vol: 0.25 }),
  stab: () => { noise({ dur: 0.12, freq: 3000, vol: 0.5, type: 'highpass' }); tone(110, { dur: 0.5, type: 'square', vol: 0.25, to: 40 }); },
  thud: () => { tone(70, { dur: 0.6, vol: 0.6, to: 30 }); noise({ dur: 0.4, freq: 150, vol: 0.4, type: 'lowpass' }); },
  rope: () => { noise({ dur: 0.5, freq: 700, q: 6, vol: 0.2, to: 300 }); tone(90, { at: 0.45, dur: 0.5, vol: 0.5, to: 45 }); },
  zap: () => { noise({ dur: 0.5, freq: 5000, vol: 0.4, type: 'highpass' }); tone(1400, { dur: 0.3, type: 'sawtooth', vol: 0.12, to: 120 }); },
  twang: () => { tone(330, { dur: 0.35, type: 'triangle', vol: 0.3, to: 300 }); noise({ at: 0.05, dur: 0.25, freq: 1500, to: 600, vol: 0.2 }); },
  miss: () => tone(500, { dur: 0.5, type: 'sine', vol: 0.15, to: 120 }),
  gavel: () => { tone(260, { dur: 0.15, type: 'square', vol: 0.15 }); noise({ dur: 0.12, freq: 1800, vol: 0.35 }); },
  pop: () => tone(660, { dur: 0.12, type: 'triangle', vol: 0.2, to: 990 }),
  pass: () => [440, 554, 659].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.4, type: 'triangle', vol: 0.15 })),
  fail: () => [392, 311].forEach((f, i) => tone(f, { at: i * 0.15, dur: 0.4, type: 'triangle', vol: 0.15 })),
  good: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.13, dur: 1.4, type: 'triangle', vol: 0.16 })),
  evil: () => { [55, 58.3, 82.4].forEach(f => tone(f, { dur: 3, type: 'sawtooth', vol: 0.12, attack: 0.4 })); noise({ dur: 2.5, freq: 200, vol: 0.15, type: 'lowpass' }); },
  flip: () => { noise({ dur: 0.15, freq: 2500, vol: 0.2 }); tone(880, { at: 0.12, dur: 0.6, type: 'triangle', vol: 0.15 }); },
  demon: () => { tone(80, { dur: 1.5, type: 'sawtooth', vol: 0.18, to: 50, attack: 0.1 }); noise({ dur: 1, freq: 300, vol: 0.2, type: 'lowpass' }); },
  drip: () => tone(1200, { dur: 0.25, vol: 0.25, to: 400 }),
  shimmer: () => [1319, 1568, 1976].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.6, type: 'sine', vol: 0.08 })),
  clang: () => { [620, 1450, 2300].forEach(f => tone(f, { dur: 0.7, type: 'square', vol: 0.05 })); noise({ dur: 0.1, freq: 3000, vol: 0.3 }); },
  key: () => [1760, 2093].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.25, type: 'triangle', vol: 0.1 })),
  turn: () => tone(587, { dur: 1.2, type: 'sine', vol: 0.2, attack: 0.05 }),
  // 刀光斬：極短的高頻破風「咻」+ 一聲金屬脆響 + 底下一記悶重的砍中
  slash: () => { noise({ dur: 0.1, freq: 6000, to: 2000, q: 0.9, vol: 0.6, type: 'highpass' }); tone(2900, { at: 0.06, dur: 0.35, type: 'triangle', vol: 0.09, to: 2500 });
    tone(4100, { at: 0.06, dur: 0.22, type: 'sine', vol: 0.05 }); tone(85, { at: 0.06, dur: 0.3, vol: 0.6, to: 38 }); noise({ at: 0.06, dur: 0.16, freq: 260, vol: 0.4, type: 'lowpass' }); },
  rumble: () => noise({ dur: 0.6, freq: 90, vol: 0.5, type: 'lowpass' }),
  // 提名：一聲炸開的和弦 + 低音（逆轉裁判「異議あり」那種）
  objection: () => { noise({ dur: 0.18, freq: 4000, vol: 0.45, type: 'highpass' }); [523, 659, 784, 1046].forEach(f => tone(f, { dur: 0.55, type: 'square', vol: 0.06, attack: 0.003 })); tone(98, { dur: 0.5, vol: 0.55, to: 45 }); },
  // 計票結果的「噔噔噔噔」：前三下短促的管弦重音，最後一下按結果收
  dun: () => { [110, 165, 220].forEach(f => tone(f, { dur: 0.32, type: 'sawtooth', vol: 0.09, attack: 0.004 })); tone(55, { dur: 0.35, vol: 0.5, to: 35 }); noise({ dur: 0.12, freq: 220, vol: 0.3, type: 'lowpass' }); },
  dunBig: () => { [110, 165, 220, 277].forEach(f => tone(f, { dur: 1.1, type: 'sawtooth', vol: 0.09, attack: 0.004 })); tone(55, { dur: 0.9, vol: 0.7, to: 30 }); noise({ dur: 0.9, freq: 2500, vol: 0.25, type: 'highpass' }); },
  flop: () => { tone(196, { dur: 0.45, type: 'triangle', vol: 0.12, to: 140 }); noise({ dur: 0.18, freq: 400, vol: 0.12, type: 'lowpass' }); },
  dunLow: () => { [98, 117, 147].forEach(f => tone(f, { dur: 0.9, type: 'sawtooth', vol: 0.08, attack: 0.004, to: f * 0.94 })); tone(49, { dur: 0.7, vol: 0.5, to: 30 }); },
  // 計票時鐘：數過一人「嗒」一聲木魚；舉了手的人「咚」一下按章
  tick: () => { tone(1700, { dur: 0.05, type: 'square', vol: 0.05 }); noise({ dur: 0.04, freq: 2600, vol: 0.18 }); },
  tock: () => { tone(220, { dur: 0.16, type: 'triangle', vol: 0.3, to: 130 }); noise({ dur: 0.07, freq: 900, vol: 0.3 }); tone(1300, { dur: 0.05, type: 'square', vol: 0.04 }); },
  // 幕布：厚布料拖過去的沙沙聲
  swish: () => { noise({ dur: 0.9, freq: 260, to: 900, q: 0.6, vol: 0.28, type: 'lowpass' }); noise({ at: 0.1, dur: 0.7, freq: 1800, to: 700, q: 0.5, vol: 0.05 }); },
  // 扔雞蛋：輕輕的破風，砸中時「咔」一下蛋殼裂開 +「啪嘰」
  toss: () => noise({ dur: 0.22, freq: 700, to: 1800, vol: 0.12 }),
  splat: () => { noise({ dur: 0.04, freq: 3800, vol: 0.3, type: 'highpass' }); noise({ at: 0.02, dur: 0.28, freq: 900, to: 180, q: 1.2, vol: 0.4, type: 'lowpass' });
    tone(170, { at: 0.02, dur: 0.16, vol: 0.18, to: 70 }); },
  // 煙花：遠處一聲悶響 + 幾顆細碎的劈啪（很輕，終局後會一直放）
  fw: () => { tone(80, { dur: 0.35, vol: 0.2, to: 45 }); noise({ dur: 0.3, freq: 300, vol: 0.12, type: 'lowpass' });
    for (let i = 0; i < 5; i++) noise({ at: 0.18 + Math.random() * 0.5, dur: 0.03, freq: 3000 + Math.random() * 3000, vol: 0.05, type: 'highpass' }); },
  // 皇冠落在頭上 / MVP 章：清脆的兩聲
  crown: () => [1047, 1568].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.5, type: 'triangle', vol: 0.12 })),
  // 技能演出（fx-ab.js）的小聲音：衣夾、毒瓶、瓶塞、書頁、水晶球、鈴、飛吻、蛛網、裂開
  clip: () => { noise({ dur: 0.03, freq: 4200, vol: 0.35, type: 'highpass' }); tone(1900, { dur: 0.05, type: 'square', vol: 0.05 }); tone(240, { at: 0.01, dur: 0.08, type: 'triangle', vol: 0.2, to: 160 }); },
  rattle: () => { for (let i = 0; i < 7; i++) noise({ at: i * 0.04 + Math.random() * 0.02, dur: 0.025, freq: 1500 + Math.random() * 1500, vol: 0.2 }); },
  cork: () => { tone(700, { dur: 0.1, type: 'triangle', vol: 0.25, to: 1500 }); noise({ dur: 0.05, freq: 2500, vol: 0.25 }); },
  page: () => [0, 0.06, 0.12].forEach(a => noise({ at: a, dur: 0.07, freq: 1800, to: 900, vol: 0.18 })),
  hum: () => { tone(220, { dur: 0.8, type: 'sine', vol: 0.13, to: 330, attack: 0.15 }); tone(331, { dur: 0.8, type: 'sine', vol: 0.07, to: 495, attack: 0.2 }); tone(110, { dur: 0.8, type: 'triangle', vol: 0.08, attack: 0.2 }); },
  bell: () => bell(1320, 0, 0.22),
  smack: () => { noise({ dur: 0.05, freq: 1800, q: 1.5, vol: 0.35 }); tone(560, { dur: 0.09, type: 'sine', vol: 0.16, to: 300 }); },
  hiss: () => noise({ dur: 0.35, freq: 5000, vol: 0.16, type: 'highpass' }),
  crack: () => { noise({ dur: 0.06, freq: 2500, vol: 0.4, type: 'highpass' }); tone(140, { dur: 0.2, vol: 0.3, to: 70 }); },
  // 心跳「撲通撲通」、烏鴉叫、撲翅、鏟土、水花、火苗、鑰匙擰開、翻一頁
  beat2: () => { tone(62, { dur: 0.18, vol: 0.55, to: 40 }); noise({ dur: 0.08, freq: 180, vol: 0.2, type: 'lowpass' });
    tone(56, { at: 0.21, dur: 0.22, vol: 0.4, to: 36 }); noise({ at: 0.21, dur: 0.08, freq: 160, vol: 0.15, type: 'lowpass' }); },
  caw: () => { tone(640, { dur: 0.17, type: 'sawtooth', vol: 0.07, to: 380 }); noise({ dur: 0.17, freq: 1400, q: 3, vol: 0.12 });
    tone(580, { at: 0.22, dur: 0.2, type: 'sawtooth', vol: 0.06, to: 330 }); noise({ at: 0.22, dur: 0.19, freq: 1300, q: 3, vol: 0.1 }); },
  flap: () => [0, 0.13, 0.26].forEach(a => noise({ at: a, dur: 0.09, freq: 520, to: 240, q: 0.7, vol: 0.18, type: 'lowpass' })),
  dig: () => { noise({ dur: 0.18, freq: 700, to: 200, q: 0.8, vol: 0.35, type: 'lowpass' }); tone(95, { dur: 0.14, vol: 0.3, to: 60 });
    for (let i = 0; i < 4; i++) noise({ at: 0.1 + i * 0.04, dur: 0.03, freq: 1200 + Math.random() * 800, vol: 0.1 }); },
  splash: () => { noise({ dur: 0.32, freq: 1700, to: 600, q: 0.6, vol: 0.22 }); tone(420, { dur: 0.12, vol: 0.07, to: 900 }); },
  fire: () => { noise({ dur: 0.7, freq: 500, to: 1200, q: 0.5, vol: 0.16, type: 'lowpass' });
    for (let i = 0; i < 6; i++) noise({ at: Math.random() * 0.6, dur: 0.02, freq: 2500 + Math.random() * 2000, vol: 0.08, type: 'highpass' }); },
  unlock: () => { noise({ dur: 0.03, freq: 3800, vol: 0.3, type: 'highpass' }); tone(1500, { dur: 0.06, type: 'square', vol: 0.05 });
    noise({ at: 0.13, dur: 0.04, freq: 2600, vol: 0.3 }); tone(900, { at: 0.13, dur: 0.1, type: 'triangle', vol: 0.12, to: 600 }); },
  leaf: () => noise({ dur: 0.09, freq: 2200, to: 1000, vol: 0.14 }),
  // 翻一頁書：紙擦過去一聲，落下時輕輕一拍
  pageturn: () => { noise({ dur: 0.38, freq: 600, to: 2000, q: 0.6, vol: 0.13 }); noise({ at: 0.34, dur: 0.1, freq: 700, q: 0.7, vol: 0.14, type: 'lowpass' }); },
  // 廚師抽鼻子：兩下短促的吸氣
  sniff: () => [0, 0.12].forEach(a => noise({ at: a, dur: 0.08, freq: 3000, to: 5200, q: 1.4, vol: 0.13 })),
};

function sample(name, k) {
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = buffers[name];
  src.playbackRate.value = 1 + (Math.random() - 0.5) * WOBBLE[name];
  g.gain.value = k;
  src.connect(g).connect(master);
  src.start();
}

// k：這一聲的音量倍數（煙花這種背景聲壓低）
export function play(name, k = 1) {
  if (muted() || !SOUNDS[name] || !ctx() || ac.state !== 'running') return;
  try {
    const rec = name === 'pageturn' ? 'page' : name;
    if (buffers[rec]) return sample(rec, k);
    if (k !== 1) { bus = ac.createGain(); bus.gain.value = k; bus.connect(master); }
    SOUNDS[name]();
  } catch { /* 音效失敗不影響遊戲 */ } finally { bus = null; }
}
