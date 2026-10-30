# 開屏小鎮（public/index.html）的數據：從夜景三層圖算出小鎮剪影和每扇亮著的窗戶。
# 剪影是內聯的矢量路徑（圖還沒到時第一幀就有小鎮），窗戶是蓋在夜景圖上的暗塊座標，開屏時一塊塊揭開就是亮燈。
# 用法：python -I art-src/boot-town.py → 打印 SVG 路徑和窗戶數組，貼進 index.html
import os
import numpy as np
from PIL import Image

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'img', 'art')
layers = [Image.open(os.path.join(root, f'town-{n}-night.webp')).convert('RGBA') for n in ('far', 'mid', 'near')]
base = Image.new('RGBA', layers[0].size, (0, 0, 0, 0))
for im in layers: base.alpha_composite(im)
rgba = np.asarray(base).astype(int)
H, W = rgba.shape[:2]
R, G, B, A = (rgba[..., i] for i in range(4))

# 剪影：中、近兩層每一列最高的不透明點連成一條線（遠山不算），再抽稀
solid = (np.asarray(layers[1])[..., 3] > 128) | (np.asarray(layers[2])[..., 3] > 128)
top = np.where(solid.any(0), solid.argmax(0), H)
def rdp(p, eps):
    keep, stack = [0, len(p) - 1], [(0, len(p) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1: continue
        ax, ay = p[a]; bx, by = p[b]
        d = abs((by - ay) * (p[a + 1:b, 0] - ax) - (bx - ax) * (p[a + 1:b, 1] - ay)) / max(np.hypot(bx - ax, by - ay), 1)
        i = d.argmax()
        if d[i] > eps:
            m = a + 1 + i
            keep.append(m); stack += [(a, m), (m, b)]
    return p[sorted(keep)]
pts = rdp(np.stack([np.arange(W), top], 1), 1.5)
d = f'M0 {H}L' + ' '.join(f'{x} {y}' for x, y in pts) + f'L{W} {H}z'

# 窗戶：夜景裏亮著的暖色塊；並排的兩扇算一扇（一起亮），鐘面單獨處理
lit = (R > 205) & (G > 165) & (B > 85) & (R - B > 35) & (A > 128)
CLOCK = (938, 562, 1016, 628)
lit[CLOCK[1]:CLOCK[3], CLOCK[0]:CLOCK[2]] = False
near = lit.copy()
for _ in range(3): near = near | np.roll(near, 1, 0) | np.roll(near, -1, 0) | np.roll(near, 1, 1) | np.roll(near, -1, 1)
seen = np.zeros_like(near, bool)
rects = []
for y0, x0 in zip(*np.nonzero(near)):
    if seen[y0, x0]: continue
    stack, xs, ys = [(y0, x0)], [], []
    seen[y0, x0] = True
    while stack:
        y, x = stack.pop()
        if lit[y, x]: xs.append(x); ys.append(y)
        for v, u in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= v < H and 0 <= u < W and near[v, u] and not seen[v, u]:
                seen[v, u] = True; stack.append((v, u))
    if len(xs) >= 8: rects.append((min(xs) - 1, min(ys) - 1, max(xs) - min(xs) + 3, max(ys) - min(ys) + 3))
rects.sort()
print(d)
print(len(pts), 'points', len(d), 'bytes')
print(','.join(map(str, np.ravel(rects))))
print(len(rects), 'windows')
