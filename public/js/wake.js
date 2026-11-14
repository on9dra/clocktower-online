// 屏幕常亮：線下局的說書人一局要拿著設備一兩個小時，夜裏放下不動屏幕就熄了。切回前台時重新申請（系統切後台會收回）
// 兩條路：系統的屏幕常亮（navigator.wakeLock）；沒有或者申請不下來的瀏覽器（一些套殼瀏覽器），循環放一段看不見、沒聲音的小視頻頂著
// 走了哪條路、為什麼沒成，報給後台（一次訪問每種結果報一次），不然只看得到「老是斷線」看不出原因
import { note } from './diag.js';

let want = false, lock = null, video = null, armed = false;
const told = new Set();
const tell = (how, err) => { const k = how + '|' + (err || ''); if (!told.has(k)) { told.add(k); note('wake', { how, err }); } };

// 視頻要用戶點過屏幕才放得了：放不了就等下一次點按
function play() {
  if (!want || document.hidden) return;
  if (!video) {
    video = Object.assign(document.createElement('video'), { src: '/img/awake.mp4', loop: true, playsInline: true, disableRemotePlayback: true });
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.append(video);
  }
  video.play().then(() => tell('video'), () => {
    if (armed) return;
    armed = true;
    addEventListener('pointerup', () => { armed = false; play(); }, { once: true, capture: true });
  });
}
async function grab() {
  if (!want || lock || document.hidden) return;
  if (!navigator.wakeLock) { tell('none', 'no api'); return play(); }
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
    tell('api');
    if (!want) { lock?.release(); lock = null; } // 申請的工夫裏局已經結束了
  } catch (e) { tell('none', String(e?.name || e).slice(0, 30)); play(); } // 省電模式、不讓用：換視頻頂著
}
document.addEventListener('visibilitychange', () => { if (document.hidden) video?.pause(); else grab(); });
export function keepAwake(on) {
  if (on === want) return;
  want = on;
  if (on) grab();
  else { lock?.release(); lock = null; video?.remove(); video = null; }
}
