# 網站圖標：從夜景小鎮（public/img/art/town-near-night.webp）裁出那座鐘樓，同一張手繪圖、同一層石頭紋理。
# 鐘面原來的四角星擦掉，換成大廳小鎮上那兩根墨色指針（同 ambient.css 的 .tl-h/.tl-m），停在差十分午夜——天黑了。
# 只要鐘樓本身：左右鄰居的屋頂挖掉，背後是開屏/大廳同一片夜空漸變。
# 標籤頁的小圖（16/32/48）裁得最緊，只剩鐘面和兩側石牆，16px 也看得出是一面金色的鐘；
# 主屏圖標（180/192/512）露出整個尖頂；Android 的 maskable 版再退遠一點，圓形裁切也切不到尖頂和十字。
# 源圖鐘樓只有 88px 寬，大圖是放大的，手繪線條本來就軟，看不出糊。
# 生成 public/favicon.ico、apple-touch-icon.png、icon-192.png、icon-512.png、icon-maskable.png
# 用法：python -I art-src/icon.py（要 Pillow、opencv-python、numpy）
import math
import os
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PUB = os.path.join(ROOT, 'public')
CX, CY = 976.5, 594          # 鐘面中心，同 ambient.js 的 CLOCK
SKY = (20, 24, 38), (35, 42, 63)  # 同開屏夜空 #141826 → #232a3f
INK = (42, 38, 34, 255)           # 指針，同 .tl-h/.tl-m 的 #2a2622

t = np.array(Image.open(os.path.join(PUB, 'img/art/town-near-night.webp')).convert('RGBA'))
t[:, :933, 3] = 0   # 鐘樓佔 934–1021 列，兩邊的房子不要
t[:, 1023:, 3] = 0
yy, xx = np.mgrid[:t.shape[0], :t.shape[1]]
star = ((xx - CX) ** 2 + (yy - CY) ** 2 < 13 ** 2) & (t[..., :3].astype(int).sum(-1) < 330)
star = cv2.dilate(star.astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
bgr = cv2.inpaint(cv2.cvtColor(t[..., :3], cv2.COLOR_RGB2BGR), star, 4, cv2.INPAINT_TELEA)
t[..., :3] = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
tower = Image.fromarray(t)


def icon(box, size):
    """box = (左, 上, 邊長)，源圖座標。放大到 1024 以上畫指針，再縮到 size"""
    x0, y0, s = box
    k = math.ceil(1024 / s)
    m = s * k
    g = np.linspace(0, 1, m)[:, None, None]
    sky = (np.array(SKY[0]) * (1 - g) + np.array(SKY[1]) * g).repeat(m, 1).astype(np.uint8)
    out = Image.fromarray(np.dstack([sky, np.full((m, m), 255, np.uint8)]))
    out.alpha_composite(tower.crop((x0, y0, x0 + s, y0 + s)).resize((m, m), Image.LANCZOS))
    d = ImageDraw.Draw(out)
    cx, cy = (CX - x0) * k, (CY - y0) * k
    for deg, length, w in ((0, 13, 4.2), (-60, 20, 2.8)):  # 時針朝上，分針指十點
        a = math.radians(deg)
        ex, ey = cx + length * k * math.sin(a), cy - length * k * math.cos(a)
        r = w * k / 2
        d.line([cx, cy, ex, ey], fill=INK, width=round(w * k))
        d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=INK)
    r = 3.2 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK)
    return out.resize((size, size), Image.LANCZOS).convert('RGB')


TIGHT, TOWER, WIDE = (931, 542, 92), (895, 466, 164), (872, 452, 210)


def png(im, name):
    im.save(os.path.join(PUB, name), optimize=True)
    print(name, os.path.getsize(os.path.join(PUB, name)), 'bytes')


icon(TIGHT, 48).save(os.path.join(PUB, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)], bitmap_format='png')
print('favicon.ico', os.path.getsize(os.path.join(PUB, 'favicon.ico')), 'bytes')
png(icon(TOWER, 180), 'apple-touch-icon.png')
png(icon(TOWER, 192), 'icon-192.png')
png(icon(TOWER, 512), 'icon-512.png')
png(icon(WIDE, 512), 'icon-maskable.png')
