// 背景音樂：大廳、白天、夜晚、提名各一首循環。大廳那首從開屏的鐘響過、小鎮揭開時起，進房間等開局也接著放，入夜的鐘換成夜晚；一局結束、勝負演完淡回大廳那首。換段都交叉淡化，不硬切；提名完回到白天，從剛才放到的地方接著放
// 用 <audio> 邊下邊放（整首解碼太佔內存，帶寬也不夠先下完），接進 AudioContext 才能在 iOS 上調音量。文件見 tools/bgm-build.py
import { musicBus, onRevive, onSoundChange, prefs } from './sfx.js';

const FADE = 2.5; // 換段的淡化秒數
const OPEN = 1.2; // 從安靜裏從頭起一首：淡入短一點，開頭幾個音不被吃掉
// 循環接頭的淡化秒數。大廳、白天兩首交接時兩副播放器放的是同一段聲音，淡得快：兩副總會錯開十來毫秒，疊著的那一下會凹一點，越短越聽不出
// （白天的音密、低音一直鋪著，凹得明顯，只淡 30 毫秒）；夜晚、提名尾巴自己退下去，疊著開頭接
const SEAM = { lobby: 0.1, day: 0.03, night: 4, vote: 4 };
// [回到第幾秒, 放到第幾秒時回去]，兩個時刻文件裏是同一段聲音，交接落在兩個音之間（對著做好的文件量的，重做要重量）。沒寫的放完整首從頭疊著接
// 大廳：開頭一段沒有低音，只第一次放；之後每圈從第二遍 A 段（帶低音）的尾巴回到第一遍低音進來後。文件在 97.068 秒剪進了第一遍（tools/bgm-build.py 的 SPLICE）
// 白天：44.356 秒一圈，文件尾巴補了 1.5 秒開頭（bgm-build.py 的 TAIL），在 0.87 秒那個空檔交接
const LOOP = { lobby: [21.25, 97.248], day: [0.87, 45.226] };
// 文件名。音頻緩存一天（server.js），重做過的曲子要換名字：不然回來的玩家拿舊文件配新的交接點，每圈接不上（tools/bgm-build.py 的 FILE 跟著改）
const FILE = { day: 'day-2' };
const url = (name, at) => `bgm/${FILE[name] || name}.m4a#t=${at}`;
// 循環時後一副提前這麼久靜音起播：剛起的頭零點幾秒，放出來的聲音還沒對上位置，跟前一副疊著淡會互相抵消、凹下去一塊；放穩了再交接
const PREROLL = 0.5;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const decks = [], pos = {};
let want = null, live = null, ducked = false;

// 手機要用戶操作過才讓 <audio> 出聲：第一次點擊時三副播放器各放一下靜音，之後換曲子不用再點。
// 已經搭好了（聲音環境本來就能出聲時先搭的）卻沒響起來：趁這一下再放一次
function unlock() {
  if (decks.length) return sync();
  const bus = musicBus();
  if (!bus) return;
  const ac = bus.context;
  for (let i = 0; i < 3; i++) {
    const el = new Audio(SILENT), gain = ac.createGain();
    gain.gain.value = 0;
    ac.createMediaElementSource(el).connect(gain).connect(bus);
    const d = { el, gain, name: null, primed: null, looping: false };
    el.addEventListener('timeupdate', () => loop(d));
    el.addEventListener('ended', () => { if (d === live) start(d.name, 0.1, LOOP[d.name]?.[0] || 0); });
    el.play().catch(() => {});
    decks.push(d);
  }
  sync();
}
addEventListener('pointerdown', unlock, { once: true });
addEventListener('keydown', unlock, { once: true });

// wait：先保持現在的音量這麼多秒再淡（排在音頻時鐘上，比定時器準）
function fade(d, to, sec, wait = 0) {
  const g = d.gain.gain, t = d.gain.context.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  if (wait) g.setValueAtTime(g.value, t + wait);
  g.linearRampToValueAtTime(to, t + wait + sec);
}
function letGo(d, sec, wait = 0) {
  if (!d) return;
  pos[d.name] = d.el.currentTime + wait;
  fade(d, 0, sec, wait);
  setTimeout(() => { if (d !== live && d.gain.gain.value < 0.01) d.el.pause(); }, (wait + sec) * 1000 + 200);
}
const spare = () => decks.reduce((a, b) => (a !== live && (b === live || a.gain.gain.value <= b.gain.gain.value) ? a : b));
// 提前把文件搭上一副空著的播放器，停在要起的那一秒，真要放的時候馬上就響
function prime(name, at = 0) {
  if (decks.some(d => d !== live && d.primed === name)) return;
  const d = spare();
  d.primed = name;
  d.el.src = url(name, at);
  d.el.load();
}
// lead：從 at 前這麼多秒靜音起，等舊的放到 until 再交接（循環用）
function start(name, sec, at, out = sec, lead = 0, until = 0) {
  const d = decks.find(x => x !== live && x.primed === name) || spare();
  const old = live;
  live = d;
  d.name = name;
  d.looping = false;
  const from = at - lead;
  if (d.primed === name) { if (Math.abs(d.el.currentTime - from) > 0.01) d.el.currentTime = from; }
  else d.el.src = url(name, from);
  d.primed = null;
  // 真的響了才開始換，網慢的時候舊的不會先沒了聲
  d.el.play().then(() => {
    if (live !== d) return;
    const wait = lead && old ? Math.max(0, until - old.el.currentTime) : 0;
    fade(d, 1, sec, wait);
    letGo(old, out, wait);
  }, () => { if (live === d) live = old; });
}
// 快放完時先搭好下一遍，再用定時器卡著起（timeupdate 四分之一秒才來一次，對不齊）
function loop(d) {
  if (d !== live || d.looping) return;
  const [from, at] = LOOP[d.name] || [0, d.el.duration - SEAM[d.name]];
  const lead = Math.min(PREROLL, from);
  const left = at - lead - d.el.currentTime;
  if (left < 6) prime(d.name, from - lead);
  if (left < 1) {
    d.looping = true;
    setTimeout(() => { if (d === live) start(d.name, SEAM[d.name], from, SEAM[d.name], lead, at); }, left * 1000);
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
  if (name) return hit ? start(name, 0.06, 0, 1.2) : start(name, live || pos[name] ? FADE : OPEN, pos[name] || 0);
  const old = live;
  live = null;
  letGo(old, FADE);
}
onSoundChange(() => sync());
// 切走時聲音環境掛起、音頻時鐘停了，淡出走不完：直接停下歸零（位置 letGo 已記下），回來從那裏淡入
document.addEventListener('visibilitychange', () => {
  sync();
  if (document.hidden) decks.forEach(d => { d.el.pause(); d.gain.gain.cancelScheduledValues(0); d.gain.gain.value = 0; });
});
// 鎖屏回來：不在點擊裏的 play() 會被拒，該響的那副停著。聲音環境恢復、或者用戶點了一下時補放
onRevive(() => {
  if (!decks.length || document.hidden) return;
  if (!live) return sync();
  if (live.el.paused) { const d = live; d.el.play().then(() => { if (live === d && !ducked) fade(d, 1, OPEN); }, () => {}); }
});

// 跟著遊戲走：開局前一直放大廳那首（大廳、房間裏等開局、一局結束等下一局）；phase 為空就停
export function setBgm(phase, nominating, hit) {
  want = phase === 'lobby' || phase === 'ended' ? 'lobby' : phase === 'night' ? 'night' : phase === 'day' || phase === 'dawn' ? (nominating ? 'vote' : 'day') : null;
  // 這一頁還沒點過，但瀏覽器本來就讓出聲（切繁簡的刷新、用鍵盤敲開的鐘）：不等點擊，現在就搭好播放器
  if (!decks.length && want && musicBus()?.context.state === 'running') unlock();
  sync(hit);
}
// 提名的過渡音響起：白天的音樂先退到後面，提名音樂搭好等章落下
export function duckBgm() {
  if (!decks.length || !prefs().music || document.hidden) return;
  if (live) { fade(live, 0.25, 0.5); ducked = true; }
  prime('vote');
}
