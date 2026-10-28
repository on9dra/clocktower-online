# 素淨版魔典台面：A1-v2（只有兩道圈線 + 頂上小太陽、底下小月亮）抹掉太陽月亮，再按同一張圖染出夜晚版。
# 圖案是同心圈線（台面略扁）：按每個方向上台面的外緣半徑歸一化，太陽、月亮那兩塊從旁邊 30° 的同一圈位置取色，邊緣羽化。
# 用法：python -I art-src/mat-plain.py → public/img/art/table-day.webp、table-night.webp（裝飾版的原圖在 A1 / A2，process.py 可以重出）
import os
import numpy as np
from PIL import Image

root = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(root, '..', 'public', 'img', 'art')
src = np.asarray(Image.open(os.path.join(root, 'A1-v2', 'table-day.png')).convert('RGBA')).astype(np.float32)
H, W = src.shape[:2]
ys, xs = np.nonzero(src[..., 3] > 128)
cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2

# 每個方向上台面外緣離圓心多遠（出了畫布算外面），平滑後按角度插值
ANG = np.linspace(-np.pi, np.pi, 3601)
def _edge(th):
    r = np.arange(0, W, .5)[:, None]
    x, y = cx + r * np.cos(th), cy + r * np.sin(th)
    ok = (x >= 0) & (x <= W - 1) & (y >= 0) & (y <= H - 1)
    inside = ok & (src[np.clip(y, 0, H - 1).astype(int), np.clip(x, 0, W - 1).astype(int), 3] > 128)
    return (inside.shape[0] - np.argmax(inside[::-1], 0)) * .5
EDGE = np.convolve(np.pad(_edge(ANG), 30, mode='wrap'), np.ones(61) / 61, 'valid')
edge = lambda th: np.interp(th, ANG, EDGE)

def sample(x, y):  # 雙線性取色
    x0, y0 = np.clip(np.floor(x).astype(int), 0, W - 2), np.clip(np.floor(y).astype(int), 0, H - 2)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    a, b, c, d = src[y0, x0], src[y0, x0 + 1], src[y0 + 1, x0], src[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

day = src.copy()
for x0, y0, x1, y1 in [(420, 0, 604, 100), (420, H - 100, 604, H)]:  # 太陽、月亮
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    th = np.arctan2(yy - cy, xx - cx)
    rho = np.hypot(xx - cx, yy - cy) / edge(th)
    th2 = (th + np.radians(30) + np.pi) % (2 * np.pi) - np.pi
    r2 = rho * edge(th2)
    fill = sample(cx + r2 * np.cos(th2), cy + r2 * np.sin(th2))
    fe = 14  # 羽化寬度
    wx = np.clip(np.minimum(xx - x0, x1 - 1 - xx) / fe, 0, 1)
    wy = np.clip(np.minimum(yy - y0 if y0 else 1e9, (y1 - 1 - yy) if y1 < H else 1e9) / fe, 0, 1)
    w = (wx * wy)[..., None]
    day[y0:y1, x0:x1] = day[y0:y1, x0:x1] * (1 - w) + fill * w
day = Image.fromarray(np.clip(day, 0, 255).astype(np.uint8), 'RGBA')
day.save(os.path.join(out, 'table-day.webp'), quality=88, method=6)

# 夜晚：紙色 → 深藍，墨線 → 灰藍，金線保留（略提亮）
a = np.asarray(day).astype(np.float32)
rgb, alpha = a[..., :3], a[..., 3:]
mx, mn = rgb.max(-1, keepdims=True), rgb.min(-1, keepdims=True)
sat = (mx - mn) / np.maximum(mx, 1)
L = rgb.mean(-1, keepdims=True)
paper, ink = 233.0, 90.0
t = np.clip((L - ink) / (paper - ink), 0, 1)
navy, slate = np.array([27, 33, 50]), np.array([142, 149, 176])
night = slate + (navy - slate) * t
brass = np.clip(rgb * 1.12, 0, 255)
k = np.clip((sat - .28) / .15, 0, 1) * (1 - t) # 飽和、偏暗的是金線
night = night * (1 - k) + brass * k
Image.fromarray(np.concatenate([night, alpha], -1).astype(np.uint8), 'RGBA').save(os.path.join(out, 'table-night.webp'), quality=88, method=6)
print('ok')

# 大廳字標：只留四個字（和「血」下的血滴），去掉上下的橫線、日月、星星、花枝
for name in ['title-tc', 'title-sc']:
    t = np.asarray(Image.open(os.path.join(out, name + '.webp')).convert('RGBA')).copy()
    cover = (t[..., 3] > 128).mean(1)  # 每一行有多少不透明
    lines = np.nonzero(cover > .8)[0]   # 貫穿全寬的橫線（字的筆畫最多到一半多）
    mid = t.shape[0] // 2
    top, bot = lines[lines < mid].max() + 4, lines[lines > mid].min() - 4
    cx = t.shape[1] // 2
    t[:top + 34, cx - 70:cx + 70, 3] = 0  # 橫線中間的太陽伸下來的光芒
    t[bot - 16:, cx - 70:cx + 70, 3] = 0  # 月亮的上沿
    band = t[top:bot]
    ys, xs = np.nonzero(band[..., 3] > 40)
    band = band[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray(band, 'RGBA')
    im = im.resize((900, round(900 * im.height / im.width)), Image.LANCZOS)  # 大廳最寬顯示 420px，兩倍屏夠用
    im.save(os.path.join(out, name + '-plain.webp'), quality=90, method=6)
print('titles ok')
