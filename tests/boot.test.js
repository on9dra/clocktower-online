// 開屏的內聯腳本要在老瀏覽器上也解析得了：解析不了就整段不跑，開屏停在那裏，「瀏覽器版本太舊」也說不出來。
// 開屏和 <head> 裏那段只用 ES2017（沒有 ?.、??、省略參數的 catch），守門那段只用 ES5。用法：node tests/boot.test.js
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
// 去掉註釋再查（註釋裏會提到這些寫法）；網址裏的 // 前面沒有空格，不算註釋
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/\s.*$/gm, '$1');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => code(m[1]));
const guard = scripts.find(s => s.includes('window.bootGuard = {'));
assert.ok(guard, '守門那段還在');
assert.ok(html.indexOf('window.bootGuard = {') < html.indexOf('window.boot = {'), '守門在開屏前面');
assert.ok(html.indexOf('window.bootGuard = {') < html.indexOf('<script type="module"'), '守門在 app.js 前面');

const ES2017 = { '?.': /\?\.[A-Za-z_$([]/, '??': /\?\?/, 'catch 不帶參數': /catch\s*\{/ };
const ES5 = { ...ES2017, '箭頭函數': /=>/, const: /\bconst\b/, let: /\blet\b/, 模板字符串: /`/, class: /\bclass\s+[A-Z]/, 展開: /\.\.\.[\w[]/ };
for (const s of scripts) {
  for (const [name, re] of Object.entries(s === guard ? ES5 : ES2017)) {
    const m = s.match(re);
    assert.ok(!m, `${s === guard ? '守門' : '開屏'}裏用了 ${name}：${m && s.slice(Math.max(0, m.index - 40), m.index + 30)}`);
  }
}
console.log('開屏內聯腳本 ✔');
