# 生成官方角色表 lib/official.js：上傳的劇本裏只寫了角色 id 時，靠它補上中文名、能力、陣營、夜晚順序和提醒標記。
# 數據來自官方倉庫 botc-release（角色、夜晚順序）和 botc-translations（簡體中文），轉成繁體後存放（界面文字統一寫繁體，運行時按需轉簡體）。
# 官方更新後重新運行：pip install opencc-python-reimplemented && python tools/gen-official.py，然後再跑一次 tools/gen-t2s.py
import json, os, re, urllib.request
from opencc import OpenCC

RELEASE = 'https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-release/main/resources/data/'
ZH = 'https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-translations/main/game/zh_Hans.json'
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
cc = OpenCC('s2t')


def fetch(url):
    with urllib.request.urlopen(url, timeout=40) as r:
        return json.load(r)


roles, sheet, zh = fetch(RELEASE + 'roles.json'), fetch(RELEASE + 'nightsheet.json'), fetch(ZH)
slug = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
at = lambda order, i: order.index(i) + 1 if i in order else 0
marks = lambda names: [cc.convert(zh['reminders'].get(slug(x), x)) for x in names or []]
tip = lambda s: cc.convert(re.sub(r':?reminder:', '', s)).strip()  # 官方文本裏 :reminder: 是一個圖標

out = {}
for r in roles:
    t = zh['roles'].get(r['id'], {})
    item = {
        'team': r['team'],
        'name': cc.convert(t.get('name', r['name'])),
        'ability': cc.convert(t.get('ability', r['ability'])),
        'first': at(sheet['firstNight'], r['id']),
        'other': at(sheet['otherNight'], r['id']),
    }
    if t.get('first'):
        item['firstTip'] = tip(t['first'])
    if t.get('other'):
        item['otherTip'] = tip(t['other'])
    if r.get('reminders'):
        item['reminders'] = marks(r['reminders'])
    if r.get('remindersGlobal'):
        item['global'] = marks(r['remindersGlobal'])
    out[r['id']] = item

path = os.path.join(root, 'lib', 'official.js')
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// 由 tools/gen-official.py 生成，請勿手改：官方角色表。first / other 是官方夜晚順序裏的位置（0 表示不行動）\n')
    f.write('export const OFFICIAL = {\n')
    for k, v in out.items():
        f.write(f'  {k}: {json.dumps(v, ensure_ascii=False)},\n')
    f.write('};\n')
print(len(out), 'roles ->', path)
