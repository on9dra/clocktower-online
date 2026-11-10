// 屏幕常亮：線下局的說書人一局要拿著設備一兩個小時，夜裏放下不動屏幕就熄了。切回前台時重新申請（系統切後台會收回）
let want = false, lock = null;
async function grab() {
  if (!want || lock || document.hidden || !navigator.wakeLock) return;
  try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch { /* 省電模式、不支持：照常用 */ }
}
document.addEventListener('visibilitychange', grab);
export function keepAwake(on) {
  if (on === want) return;
  want = on;
  if (on) grab(); else { lock?.release(); lock = null; }
}
