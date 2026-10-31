# 美術素材處理：綠底原圖 → 去背 → 裁切 / 縮放 → public/img/art/*.webp
# 用法：python -I art-src/process.py art-src/batch1 [只跑這幾個輸出名…]
# 每項：(原圖, 輸出名, 模式, 最長邊)
#   circle  去綠，按外接框裁成正方（略扁的拉正），用於台面、圓牌
#   trim    去綠，裁到內容外接框，四周留 2% 透明邊
#   canvas  去綠，保留原畫布（座標要和代碼對齊的：小鎮分層、處決台）
#   opaque  不去背，只縮放（大廳主視覺、幕布）
#   mask    轉灰度（印章斑駁遮罩）
import sys, os
import numpy as np
from PIL import Image, ImageOps

JOBS = [
    ('A2/table-night-green.png', 'table-night', 'circle', 1024),
    ('A3/town-far-day-green.png', 'town-far-day', 'canvas', 2172),
    ('A3/town-mid-day-green.png', 'town-mid-day', 'canvas', 2172),
    ('A3/town-near-day-green.png', 'town-near-day', 'canvas', 2172),
    ('A4/town-far-night-green.png', 'town-far-night', 'canvas', 2172),
    ('A4/town-mid-night-green.png', 'town-mid-night', 'canvas', 2172),
    ('A4/town-near-night-green.png', 'town-near-night', 'canvas', 2172),
    ('A5/seat-empty-green.png', 'seat-empty', 'circle', 384),
    ('A6/plate-green.png', 'plate', 'trim', 960),
    ('A6/plate-evil-green.png', 'plate-evil', 'trim', 960),
    ('A8/card-back-green.png', 'card-back', 'circle', 768),
    ('B1/title-traditional-green.png', 'title-tc', 'trim', 1600),
    ('B1/title-simplified-green.png', 'title-sc', 'trim', 1600),
    ('B2/lobby.png', 'lobby', 'opaque', 1448),
    # B3 幕布第 2 版（art-src/B3-v2，橫向無縫）另行處理：首尾各 4 列漸變對齊，不走這裏
    ('B3/curtain-valance-green.png', 'curtain-valance', 'trim', 2172),
    ('B4/sun-green.png', 'sun', 'trim', 384),
    ('B4/moon-green.png', 'moon', 'trim', 384),
    ('B5/stamp-mask.png', 'stamp-mask', 'mask', 640),
    ('B6/gallows-wood-green.png', 'gallows-wood', 'canvas', 1178),
    ('B6/gallows-noose-green.png', 'gallows-noose', 'trim', 1024),
    ('B7/crown-good-green.png', 'crown-good', 'trim', 384),
    ('B7/crown-evil-green.png', 'crown-evil', 'trim', 384),
    ('B7/mvp-medal-green.png', 'mvp-medal', 'trim', 384),
    ('B7/trophy-green.png', 'trophy', 'trim', 384),
    ('B8/egg-green.png', 'egg', 'trim', 256),
    ('B8/egg-splat-01-green.png', 'egg-splat-1', 'trim', 512),
    ('B8/egg-splat-02-green.png', 'egg-splat-2', 'trim', 512),
    ('B8/egg-splat-03-green.png', 'egg-splat-3', 'trim', 512),
]

# 這幾張是紙：統一乘一層，和 style.css 的 --card、--paper 同一檔，夜色旁邊不刺眼（mat-plain.py 的 table-day 同理）
PAPER = {'seat-empty', 'plate', 'plate-evil'}
SOFT = (.921, .922, .915)

def soft(im):
    a = np.asarray(im).astype(np.float32)
    a[..., :3] *= SOFT
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')

def key(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    spill = g - np.maximum(r, b)                  # 純綠 ≈ 255，紙、墨 ≤ 0
    alpha = 1 - np.clip((spill - 20) / 120, 0, 1)
    g = np.where(alpha < 1, np.minimum(g, np.maximum(r, b)), g)   # 去綠邊
    return Image.fromarray(np.dstack([r, g, b, alpha * 255]).clip(0, 255).astype(np.uint8), 'RGBA')

def bbox(im):
    al = np.asarray(im)[..., 3] > 128
    ys, xs = np.nonzero(al)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

def fit(im, n):
    s = n / max(im.size)
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS) if s < 1 else im

def run(src_root, out_root, only=()):
    os.makedirs(out_root, exist_ok=True)
    for src, name, mode, n in JOBS:
        if only and name not in only:
            continue
        im = Image.open(os.path.join(src_root, src))
        if mode == 'opaque':
            out = fit(im.convert('RGB'), n)
        elif mode == 'mask':
            out = fit(ImageOps.grayscale(im), n)
        else:
            out = key(im)
            if mode == 'circle':
                out = out.crop(bbox(out)); side = max(out.size); out = out.resize((side, side), Image.LANCZOS)
            elif mode == 'trim':
                x0, y0, x1, y1 = bbox(out); p = round(max(x1 - x0, y1 - y0) * .02)
                out = out.crop((max(x0 - p, 0), max(y0 - p, 0), min(x1 + p, out.width), min(y1 + p, out.height)))
            out = fit(out, n)
            if name in PAPER:
                out = soft(out)
        path = os.path.join(out_root, name + '.webp')
        out.save(path, 'WEBP', quality=84, method=6)
        print(f'{name:16} {mode:7} {out.width}x{out.height}  {os.path.getsize(path) // 1024}KB')

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    run(sys.argv[1], os.path.join(here, '..', 'public', 'img', 'art'), sys.argv[2:])
