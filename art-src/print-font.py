# 規則書和介紹卡內嵌的宋體：從 Noto Serif（SIL OFL，可以子集化後分發）裏只取這兩處用到的字，繁簡各一份。
# 不內嵌的話，沒裝思源宋體的 Windows 會回退到細瘦的中易宋體，再好的版面也印不出來。
# 改了 help.js / intro.js 的文字就重跑：python -I art-src/print-font.py
import re
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
from fontTools.varLib import instancer

SRC = {'tc': 'C:/Windows/Fonts/NotoSerifTC-VF.ttf', 'sc': 'C:/Windows/Fonts/NotoSerifSC-VF.ttf'}
read = lambda p: open(p, encoding='utf8').read()

text = read('public/js/help.js') + read('public/js/intro.js') + read('public/js/glyph.js')
text += ''.join(re.findall(r"name: '([^']+)'", read('public/js/roles.js')))
tc = set(re.findall(r'[\u3400-\u9fff\uff00-\uffef\u3000-\u303f·…—「」『』]', text))
t2s = re.findall(r'const [TS] = "([^"]+)"', read('public/js/t2s.js'))
pairs = dict(zip(*t2s))
sc = {pairs.get(c, c) for c in tc}
ascii_ = {chr(c) for c in range(32, 127)}
print('字數', len(tc), len(sc), '對照', len(pairs))

for lang, chars in (('tc', tc), ('sc', sc)):
    f = TTFont(SRC[lang])
    instancer.instantiateVariableFont(f, {'wght': (500, 900)}, inplace=True)
    o = Options()
    o.flavor, o.layout_features = 'woff2', ['kern', 'locl', 'palt', 'vert', 'vrt2']
    o.drop_tables += ['DSIG']
    s = Subsetter(o)
    s.populate(unicodes=[ord(c) for c in chars | ascii_])
    s.subset(f)
    f.flavor = 'woff2'
    f.save(f'public/fonts/serif-{lang}.woff2')
