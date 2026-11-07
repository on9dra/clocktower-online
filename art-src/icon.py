# 網站圖標：大廳字標旁那枚紅印章，蓋的是字標裏的「血」（public/img/art/title-sc-plain.webp 第一個字，連那滴血一起）。
# 探索時擲了三個方向（角色牌雙圈印、郵票齒孔、極簡幾何鐘樓）：郵票和鐘樓縮到 16px 只剩一個點或一塊，
# 留下的是印章本體 + 角色牌/.ink-stamp 的雙線邊（大圖才畫），小圖整塊紅底不畫邊，同極簡幾何的思路。
# 生成 public/favicon.svg（描出來的路徑）、public/favicon.ico（16/32/48）、public/apple-touch-icon.png（180，夜空底 + 斜蓋的章，帶印泥紋理）。
# 用法：python art-src/icon.py（要 Pillow、opencv-python、numpy）
import os
import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PUB = os.path.join(ROOT, 'public')
RED, CREAM, NAVY = (163, 39, 29), (244, 238, 223), (20, 24, 38)  # 同 .lobby-seal、字標、開屏夜空

# 字標第一個字的形狀（透明度），四周留一點邊
title = Image.open(os.path.join(PUB, 'img/art/title-sc-plain.webp')).convert('RGBA')
glyph = title.crop((0, 0, 220, 209)).split()[-1]
glyph = glyph.crop(glyph.getbbox())


def seal(size, line=True):
    """size×size 的紅印章：紅底、米色字，裏面一粗一細兩道邊，同 .ink-stamp 和角色牌的雙線（小尺寸不畫，會糊）"""
    k = 4  # 畫大再縮，邊緣平滑
    S = size * k
    im = Image.new('RGBA', (S, S), RED + (255,))
    d = ImageDraw.Draw(im)
    if line:
        w = max(k, round(S * .022))
        m = round(S * .075)
        d.rectangle([m, m, S - 1 - m, S - 1 - m], outline=CREAM, width=w)
        m += 2 * w
        d.rectangle([m, m, S - 1 - m, S - 1 - m], outline=CREAM, width=max(k, w // 2))
    # 字佔印面的六七成，略往上提（底下有那滴血）
    gw = round(S * (.6 if line else .74))
    gh = round(gw * glyph.height / glyph.width)
    g = glyph.resize((gw, gh), Image.LANCZOS)
    im.paste(Image.new('RGBA', g.size, CREAM + (255,)), ((S - gw) // 2, (S - gh) // 2 - round(S * .01)), g)
    return im.resize((size, size), Image.LANCZOS)


def inked(im):
    """印泥紋理：同大廳印章的 stamp-mask（亮處留墨，暗處掉色）"""
    tex = Image.open(os.path.join(PUB, 'img/art/stamp-mask.webp')).convert('L')
    tex = tex.crop((0, 0, tex.height, tex.height)).resize(im.size, Image.LANCZOS)
    a = ImageChops.multiply(im.split()[-1], tex)
    im.putalpha(a)
    return im


# apple-touch-icon：夜空底（iOS 自己切圓角），中間一枚斜蓋的章，同大廳那枚逆時針斜 8°；只用到幾十種顏色，存成調色板 PNG
touch = Image.new('RGBA', (180, 180), NAVY + (255,))
s = inked(seal(132)).rotate(8, resample=Image.BICUBIC, expand=True)
touch.alpha_composite(s, ((180 - s.width) // 2, (180 - s.height) // 2))
touch.convert('RGB').quantize(48, dither=Image.Dither.NONE).save(os.path.join(PUB, 'apple-touch-icon.png'), optimize=True)

# favicon.ico：透明底的章，小尺寸不畫細邊
seal(48, line=False).save(os.path.join(PUB, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)], bitmap_format='png')

# favicon.svg：64 格，字描成路徑（外輪廓和洞一起，evenodd）
N = 64
k = 16  # 描邊用的放大倍數
gw = round(N * .74 * k)
gh = round(gw * glyph.height / glyph.width)
big = np.array(glyph.resize((gw, gh), Image.LANCZOS))
_, bw = cv2.threshold(big, 127, 255, cv2.THRESH_BINARY)
contours, _ = cv2.findContours(bw, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
ox, oy = (N - gw / k) / 2, (N - gh / k) / 2 - N * .01
parts = []
for c in contours:
    c = cv2.approxPolyDP(c, k * .09, True)
    if len(c) < 3:
        continue
    pts = [f'{ox + x / k:.1f} {oy + y / k:.1f}'.replace('.0 ', ' ') for x, y in c[:, 0]]
    parts.append('M' + ' '.join(pts) + 'z')
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}">'
       f'<rect width="{N}" height="{N}" fill="#a3271d"/>'
       f'<path fill="#f4eedf" fill-rule="evenodd" d="{"".join(parts)}"/></svg>\n')
open(os.path.join(PUB, 'favicon.svg'), 'w', encoding='utf-8').write(svg)
print('favicon.svg', len(svg), 'bytes;', len(parts), 'contours')
