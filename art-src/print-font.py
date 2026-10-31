# 規則書和介紹卡內嵌的宋體：從 Noto Serif（SIL OFL，可以子集化後分發）裏只取這兩處用到的字，繁簡各一份。
# 不內嵌的話，沒裝思源宋體的 Windows 會回退到細瘦的中易宋體，再好的版面也印不出來。
# 介紹卡是新訪客第一眼，單獨切一份只有它用到的字（card-*），不用等規則書那一整份（serif-*）。
# 改了 help.js / intro.js 的文字就重跑：python -I art-src/print-font.py
import re
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
from fontTools.varLib import instancer

SRC = {'tc': 'C:/Windows/Fonts/NotoSerifTC-VF.ttf', 'sc': 'C:/Windows/Fonts/NotoSerifSC-VF.ttf'}
read = lambda p: open(p, encoding='utf8').read()

text = read('public/js/help.js') + read('public/js/intro.js') + read('public/js/glyph.js')
text += ''.join(re.findall(r"(?:name: |\bR\('[^']+', )'([^']+)'", read('public/js/roles.js')))  # 陣營名、角色名
tc = set(re.findall(r'[\u3400-\u9fff\uff00-\uffef\u3000-\u303f·…—「」『』]', text))
t2s = re.findall(r'const [TS] = "([^"]+)"', read('public/js/t2s.js'))
pairs = dict(zip(*t2s))
sc = {pairs.get(c, c) for c in tc}
ascii_ = {chr(c) for c in range(32, 127)}
print('字數', len(tc), len(sc), '對照', len(pairs))

# 介紹卡：intro.js 的字 + 牌上那幾個角色的名字
shown = ''.join(re.findall(r"'[^'\n]*'|`[^`]*`", re.sub(r'^\s*//.*$| // .*$', '', read('public/js/intro.js'), flags=re.M)))  # 只要字符串裏的字，注釋不算
card_tc = set(re.findall(r'[\u3400-\u9fff\uff00-\uffef\u3000-\u303f·…—「」『』]', shown + '洗衣婦共情者僧侶廚師投毒者小惡魔'))
card_sc = {pairs.get(c, c) for c in card_tc}
print('介紹卡字數', len(card_tc))

for name, lang, chars in (('serif-tc', 'tc', tc), ('serif-sc', 'sc', sc), ('card-tc', 'tc', card_tc), ('card-sc', 'sc', card_sc)):
    f = TTFont(SRC[lang])
    instancer.instantiateVariableFont(f, {'wght': (500, 900)}, inplace=True)
    o = Options()
    o.flavor, o.layout_features = 'woff2', ['kern', 'locl', 'palt', 'vert', 'vrt2']
    o.drop_tables += ['DSIG']
    s = Subsetter(o)
    s.populate(unicodes=[ord(c) for c in chars | ascii_])
    s.subset(f)
    f.flavor = 'woff2'
    f.save(f'public/fonts/{name}.woff2')
