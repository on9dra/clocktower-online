# 生成繁→簡單字轉換表 public/js/t2s.js：掃描前後端源碼裏出現的所有漢字，用 OpenCC 轉換。
# 改了界面文字之後重新運行：pip install opencc-python-reimplemented && python tools/gen-t2s.py
import glob, json, os
from opencc import OpenCC

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
cc = OpenCC('t2s')
# OpenCC 不轉、但大陸該換的字。逐字表做不了按詞轉換，這裏直接指定（對照過最新的 OpenCC 和維基的繁簡表）：
#   暱→昵：OpenCC 當它們是異體字，不轉（大廳的「暱稱」、改名框）
#   著→着：OpenCC 按詞才轉。界面裏的「著」都是「接著、活著、舉著」這種，大陸寫「着」；以後界面裏要寫「著名、顯著」得換個說法
OVERRIDE = {'暱': '昵', '著': '着'}
chars = set()
for pattern in ('public/js/*.js', 'lib/*.js', 'public/index.html'):
    for path in glob.glob(os.path.join(root, pattern)):
        if path.endswith('t2s.js'):
            continue
        chars |= {c for c in open(path, encoding='utf-8').read() if ord(c) > 0x2e80}
pairs = sorted((c, OVERRIDE.get(c) or cc.convert(c)) for c in chars)
pairs = [(t, s) for t, s in pairs if t != s and len(s) == 1]
t = ''.join(p[0] for p in pairs)
s = ''.join(p[1] for p in pairs)
out = os.path.join(root, 'public', 'js', 't2s.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write('// 由 tools/gen-t2s.py 生成，請勿手改：繁體字 → 簡體字（只含界面用到的字）\n')
    f.write(f'const T = {json.dumps(t, ensure_ascii=False)};\n')
    f.write(f'const S = {json.dumps(s, ensure_ascii=False)};\n')
    f.write('const s = Array.from(S);\n')
    f.write('export const T2S = new Map(Array.from(T, (c, i) => [c, s[i]]));\n')
print(len(pairs), 'chars ->', out)
