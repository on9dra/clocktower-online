// index.html 的 modulepreload 名單要和 app.js 靜態 import 到的模塊一致：漏了多一層往返，多了白拉（或 404）
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const seen = new Set();
(function walk(n) {
  if (seen.has(n)) return;
  seen.add(n);
  for (const m of read(`js/${n}.js`).matchAll(/^import [^;]*? from '\.\/([\w-]+)\.js'/gm)) walk(m[1]);
})('app');

const list = read('index.html').match(/for \(const n of '([^']+)'\.split\(' '\)\)/)[1].split(' ');
assert.deepStrictEqual([...list].sort(), [...seen].sort());
console.log('預加載名單 ✔');
