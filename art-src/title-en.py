# 英文字標 public/img/art/title-en-plain.webp：大廳和開屏當蒙版用（同 title-tc-plain / title-sc-plain，白字透明底）。
# 字型取中文字標同一套 Noto Serif 的 Black 字重（public/fonts/serif-tc.woff2 裏的拉丁字母），氣質一致；
# 「BLOOD ON THE」一行小字 + 「CLOCKTOWER」一行大字，O 底下墜一滴血，對應中文「血」字底下那滴。
# 運行：python art-src/title-en.py（要 pillow、fonttools、brotli）
import io, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from PIL import Image, ImageDraw, ImageFont

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
f = instancer.instantiateVariableFont(TTFont(os.path.join(root, 'public/fonts/serif-tc.woff2')), {'wght': 900})
f.flavor = None
buf = io.BytesIO(); f.save(buf)

S = 4  # 先畫大再縮，邊緣平滑
W = 900
big = ImageFont.truetype(io.BytesIO(buf.getvalue()), 150 * S)
small = ImageFont.truetype(io.BytesIO(buf.getvalue()), 64 * S)


def line(text, font, track):
    """一行字，字距 track（px，畫大後的尺寸）"""
    ws = [font.getbbox(c) for c in text]
    width = sum(font.getlength(c) for c in text) + track * (len(text) - 1)
    asc, desc = font.getmetrics()
    im = Image.new('L', (int(width) + 4, asc + desc), 0)
    d = ImageDraw.Draw(im)
    x = 0
    for c in text:
        d.text((x, 0), c, font=font, fill=255)
        x += font.getlength(c) + track
    return im.crop(im.getbbox())


top = line('BLOOD ON THE', small, 22 * S)
bot = line('CLOCKTOWER', big, 4 * S)
gap = 18 * S
w = max(top.width, bot.width)
h = top.height + gap + bot.height + 46 * S  # 底下留出血滴
img = Image.new('L', (w, h), 0)
img.paste(top, ((w - top.width) // 2, 0))
img.paste(bot, ((w - bot.width) // 2, top.height + gap))

# 血滴：從中文字標「血」底下剪過來，掛在 CLOCKTOWER 第一個 O 的底部
zh = Image.open(os.path.join(root, 'public/img/art/title-tc-plain.webp')).getchannel('A')
drip = zh.crop((128, 182, 162, 208))  # 只取筆畫下面的細莖和水滴
drip = drip.crop(drip.getbbox())
k = w / W  # 剪下來的是成品尺寸，畫布是成品的 w/W 倍
drip = drip.resize((round(drip.width * k), round(drip.height * k)), Image.LANCZOS)
ob = bot.crop((int(big.getlength('CL')), 0, int(big.getlength('CLO')), bot.height)).getbbox()  # O 的實際墨跡範圍
ox = (w - bot.width) // 2 + int(big.getlength('CL')) + (ob[0] + ob[2]) // 2
oy = top.height + gap + ob[3] - round(3 * k)  # 細莖頂端插進 O 底部的筆畫裏
img.paste(255, (ox - drip.width // 2, oy), drip)

img = img.crop(img.getbbox())
img = img.resize((W, round(img.height * W / img.width)), Image.LANCZOS)
out = Image.new('RGBA', img.size, (255, 255, 255, 0))
out.putalpha(img)
out.save(os.path.join(root, 'public/img/art/title-en-plain.webp'), lossless=True)
print('title-en-plain.webp', out.size)
