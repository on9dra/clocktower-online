// 背景音樂：白天、夜晚、提名各一首循環。換段都交叉淡化，不硬切；提名完回到白天，從剛才放到的地方接著放
// 用 <audio> 邊下邊放（整首解碼太佔內存，帶寬也不夠先下完），接進 AudioContext 才能在 iOS 上調音量。文件見 tools/bgm-build.py
import { musicBus, onSoundChange, prefs } from './sfx.js';

const FADE = 2.5; // 換段的淡化秒數
// 循環接頭的淡化秒數。白天那首是無縫循環，文件尾巴多帶了這麼長一段開頭，兩副播放器放的是同一段聲音；另外兩首尾巴自己退下去，疊著開頭接
const SEAM = { day: 0.6, night: 4, vote: 4 };
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const decks = [], pos = {};
let want = null, live = null, ducked = false;

// 手機要用戶操作過才讓 <audio> 出聲：第一次點擊時三副播放器各放一下靜音，之後換曲子不用再點
function unlock() {
  const bus = musicBus();
  if (!bus || decks.length) return;
  const ac = bus.context;
  for (let i = 0; i < 3; i++) {
    const el = new Audio(SILENT), gain = ac.createGain();
    gain.gain.value = 0;
    ac.createMediaElementSource(el).connect(gain).connect(bus);
    const d = { el, gain, name: null, primed: null, looping: false };
    el.addEventListener('timeupdate', () => loop(d));
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
const spare = () => decks.reduce((a, b) => (a !== live && (b === live || a.gain.gain.value <= b.gain.gain.value) ? a : b));
// 提前把文件搭上一副空著的播放器，真要放的時候馬上就響
function prime(name) {
  if (decks.some(d => d !== live && d.primed === name)) return;
  const d = spare();
  d.primed = name;
  d.el.src = `bgm/${name}.m4a`;
  d.el.load();
}
function start(name, sec, at, out = sec) {
  const d = decks.find(x => x !== live && x.primed === name) || spare();
  const old = live;
  live = d;
  d.name = name;
  d.looping = false;
  if (d.primed === name) d.el.currentTime = at;
  else d.el.src = `bgm/${name}.m4a#t=${at}`;
  d.primed = null;
  // 真的響了才開始換，網慢的時候舊的不會先沒了聲
  d.el.play().then(() => { if (live !== d) return; fade(d, 1, sec); letGo(old, out); }, () => { if (live === d) live = old; });
}
// 快放完時先搭好下一遍，再用定時器卡著接頭起（timeupdate 四分之一秒才來一次，對不齊）
function loop(d) {
  if (d !== live || d.looping) return;
  const left = d.el.duration - d.el.currentTime - SEAM[d.name];
  if (left < 6) prime(d.name);
  if (left < 1) {
    d.looping = true;
    setTimeout(() => { if (d === live) start(d.name, SEAM[d.name], 0); }, left * 1000);
  }
}

// hit：章落下的那一拍換曲，新曲從頭起，舊曲在章聲後面退下去
function sync(hit) {
  if (!decks.length) return;
  const name = prefs().music && !document.hidden ? want : null;
  if (name === (live?.name || null)) {
    if (live && ducked) fade(live, 1, 1);
    ducked = false;
    return;
  }
  ducked = false;
  if (name) return hit ? start(name, 0.06, 0, 1.2) : start(name, FADE, pos[name] || 0);
  const old = live;
  live = null;
  letGo(old, FADE);
}
onSoundChange(() => sync());
document.addEventListener('visibilitychange', () => sync());

// 跟著遊戲走：phase 為空就停
export function setBgm(phase, nominating, hit) {
  want = phase === 'night' ? 'night' : phase === 'day' || phase === 'dawn' ? (nominating ? 'vote' : 'day') : null;
  sync(hit);
}
// 提名的過渡音響起：白天的音樂先退到後面，提名音樂搭好等章落下
export function duckBgm() {
  if (!decks.length || !prefs().music || document.hidden) return;
  if (live) { fade(live, 0.25, 0.5); ducked = true; }
  prime('vote');
}
