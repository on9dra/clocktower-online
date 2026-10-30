// 循環氛圍：畫面靜止時也有東西在動（樣式見 ambient.css）。雲和星星、烏鴉在天上，炊煙、窗燈、鐘針在小鎮上。
// 小鎮上的東西用三層圖的座標（2172×724），svg 的 slice 對齊方式和圖的 bottom center / cover 一樣，換屏幕尺寸也對得上
import { h } from './ui.js';

// 會開關的窗（x, y, 寬, 高）：開屏 WINDOWS 裏隔幾扇挑一扇，散在全鎮
const LAMPS = [81, 675, 7, 13, 166, 655, 10, 15, 280, 672, 4, 9, 364, 695, 4, 11, 475, 656, 5, 9, 608, 628, 8, 14, 730, 644, 10, 14, 869, 624, 7, 14, 974, 636, 8, 29, 1151, 680, 11, 12, 1355, 666, 7, 18, 1477, 659, 9, 16, 1562, 675, 7, 13, 1666, 612, 4, 13, 1800, 683, 7, 11, 1946, 666, 5, 9, 2071, 643, 10, 21];
const CHIMNEY = [[199, 590], [575, 570], [1254, 572], [1415, 572], [2076, 556]];
const CLOCK = [976.5, 594]; // 鐘面中心

const CLOUD = '<svg viewBox="0 0 200 72"><path d="M16 68C4 68-2 54 8 46c4-3 9-4 13-3 1-15 19-23 32-15 6-15 27-22 42-13 8 5 13 12 14 20 7-6 18-6 25 1 5-3 12-3 17 2 7 7 3 19-7 21 2 6-3 9-9 9z"/></svg>';
const CROW = '<svg viewBox="0 0 40 20"><path class="up" d="M2 4c8-2 14 4 18 7 4-3 10-9 18-7-7 3-12 8-16 9l1 3-3-2-3 2 1-3C14 12 9 7 2 4z"/><path class="dn" d="M2 16c6-6 12-7 18-6 6-1 12 0 18 6-6-2-11-3-15-3l0 3-3-1.500-3 1.500 0-3c-4 0-9 1-15 3z"/></svg>';

// 同一批數每次都一樣：星星不會隨重繪換位置
const rand = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const dots = (r, n) => Array.from({ length: n }, () => `${(r() * 100).toFixed(1)}vw ${(r() * 58).toFixed(1)}vh 0 ${r() > .7 ? 1 : .5}px #fff8e0`).join(',');

export function skyLife(cls = '') {
  const r = rand(1868);
  const root = h('div', { class: 'sky-life ' + cls, 'aria-hidden': 'true' });
  [[7, 1, 190, 20], [17, .7, 260, 150], [30, 1.25, 150, 90]].forEach(([y, s, t, d]) => {
    const c = h('div', { class: 'cloud', style: { '--y': y + 'vh', '--s': s, '--t': t + 's', '--d': -d + 's' } });
    c.innerHTML = CLOUD;
    root.append(c);
  });
  [0, 1, 2].forEach(k => root.append(h('i', { class: 'twinkle', style: { boxShadow: dots(r, 9), '--d': -k * 1.7 + 's' } })));
  const crow = h('div', { class: 'crow' });
  crow.innerHTML = CROW;
  root.append(crow);
  return root;
}

export function townLife() {
  const root = h('div', { class: 'town-life', 'aria-hidden': 'true' });
  const r = rand(1314), now = new Date();
  const min = now.getMinutes() * 60 + now.getSeconds(), hour = (now.getHours() % 12) * 3600 + min;
  const lamps = [];
  for (let i = 0; i < LAMPS.length; i += 4) {
    const [x, y, w, H] = LAMPS.slice(i, i + 4);
    lamps.push(`<rect x="${x}" y="${y}" width="${w}" height="${H}" rx="2" style="--t:${(36 + r() * 60).toFixed(0)}s;--d:-${(r() * 90).toFixed(0)}s"/>`);
  }
  // 延遲都是一格定格（.3s）的整數倍：所有煙團同一拍換格，svg 一秒只重繪三次
  const puffs = CHIMNEY.flatMap(([x, y], i) => [0, 1, 2].map(k => `<circle cx="${x}" cy="${y}" r="7" style="--d:-${(k * 2.7 + i * 1.2).toFixed(1)}s"/>`));
  root.innerHTML = `<svg viewBox="0 0 2172 724" preserveAspectRatio="xMidYMax slice"><g class="tl-lamps">${lamps.join('')}</g><g class="tl-smoke">${puffs.join('')}</g>`
    + `<line class="tl-h" x1="${CLOCK[0]}" y1="${CLOCK[1]}" x2="${CLOCK[0]}" y2="${CLOCK[1] - 15}" style="--d:-${hour}s"/>`
    + `<line class="tl-m" x1="${CLOCK[0]}" y1="${CLOCK[1]}" x2="${CLOCK[0]}" y2="${CLOCK[1] - 24}" style="--d:-${min}s"/></svg>`;
  return root;
}
