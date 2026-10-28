// 頻率限制：令牌桶。每個鍵（IP、連接、座位）一個桶，最多攢 burst 個令牌，每 per 毫秒回一個
// RATE_LIMIT=0 關掉（壓測時用：tests/load.js 從一台機器開很多房間）
const buckets = new Map();
const enabled = process.env.RATE_LIMIT !== '0';

// cost = 0 只看還有沒有令牌，不扣（輸錯房號才扣的場合）
export function allow(key, [burst, per], cost = 1) {
  if (!enabled) return true;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) buckets.set(key, b = { n: burst, at: now });
  else { b.n = Math.min(burst, b.n + (now - b.at) / per); b.at = now; }
  if (b.n < 1) return false;
  b.n -= cost;
  return true;
}

// 一小時沒動過的桶早就回滿了，扔掉
setInterval(() => {
  const old = Date.now() - 3600 * 1000;
  for (const [k, b] of buckets) if (b.at < old) buckets.delete(k);
}, 600 * 1000).unref();
