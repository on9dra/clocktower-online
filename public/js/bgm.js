// 背景音樂：白天、夜晚、提名各一首循環。換段和循環接頭都交叉淡化，不硬切；提名完回到白天，從剛才放到的地方接著放
// 用 <audio> 邊下邊放（整首解碼太佔內存，帶寬也不夠先下完），接進 AudioContext 才能在 iOS 上調音量。文件見 tools/bgm-build.py
import { musicBus, muted, onSoundChange, prefs } from './sfx.js';

const TRACK = { day: 'day-a', night: 'night-a', vote: 'vote-a' };
const FADE = 2.5, SEAM = 4; // 換段、循環接頭的淡化秒數
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const decks = [], pos = {};
let want = null, forced = null, live = null;

// 手機要用戶操作過才讓 <audio> 出聲：第一次點擊時三副播放器各放一下靜音，之後換曲子不用再點
function unlock() {
  const bus = musicBus();
  if (!bus || decks.length) return;
  const ac = bus.context;
  for (let i = 0; i < 3; i++) {
    const el = new Audio(SILENT), gain = ac.createGain();
    gain.gain.value = 0;
    ac.createMediaElementSource(el).connect(gain).connect(bus);
    const d = { el, gain, name: null };
    el.addEventListener('timeupdate', () => { if (d === live && el.duration - el.currentTime < SEAM) start(d.name, SEAM, 0); });
    el.addEventListener('ended', () => { if (d === live) start(d.name, 0.1, 0); });
    el.play().catch(() => {});
    decks.push(d);
  }
  sync();
}
addEventListener('pointerdown', unlock, { once: true });
addEventListener('keydown', unlock, { once: true });

function fade(d, to, sec) {
  const g = d.gain.gain, t = d.gain.context.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(to, t + sec);
}
function letGo(d, sec) {
  if (!d) return;
  pos[d.name] = d.el.currentTime;
  fade(d, 0, sec);
  setTimeout(() => { if (d !== live && d.gain.gain.value < 0.01) d.el.pause(); }, sec * 1000 + 200);
}
function start(name, sec, at) {
  const d = decks.reduce((a, b) => (a !== live && (b === live || a.gain.gain.value <= b.gain.gain.value) ? a : b));
  const old = live;
  live = d;
  d.name = name;
  d.el.src = `bgm/${name}.m4a#t=${at}`;
  // 真的響了才開始換，網慢的時候舊的不會先沒了聲
  d.el.play().then(() => { if (live !== d) return; fade(d, 1, sec); letGo(old, sec); }, () => { if (live === d) live = old; });
}

function sync() {
  if (!decks.length) return;
  const on = !muted() && prefs().music && !document.hidden;
  const name = on ? TRACK[forced || want] : null;
  if (name === (live?.name || null)) return;
  if (name) return start(name, FADE, pos[name] || 0);
  const old = live;
  live = null;
  letGo(old, FADE);
}
onSoundChange(sync);
document.addEventListener('visibilitychange', sync);

// 跟著遊戲走：phase 為空就停
export function setBgm(phase, nominating) {
  want = phase === 'day' ? (nominating ? 'vote' : 'day') : phase === 'night' || phase === 'dawn' ? 'night' : null;
  sync();
}
// 演示頁試聽：放某一段的某一版；'off' 靜音，空就回到跟著遊戲走。選中的版本留到別的場景
export function audition(kind, take) {
  if (take) TRACK[kind] = `${kind}-${take}`;
  forced = kind;
  sync();
}
