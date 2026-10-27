import sys, numpy as np
from PIL import Image
src, out_png, out_webp, size = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
im = np.array(Image.open(src).convert('RGB')).astype(np.float32)
r, g, b = im[...,0], im[...,1], im[...,2]
spill = g - np.maximum(r, b)              # 纯绿 ≈ 255，纸 ≈ 负数
alpha = 1 - np.clip((spill - 20) / (140 - 20), 0, 1)
# 去绿边：半透明处把 g 压回 max(r,b)
g2 = np.where(alpha < 1, np.minimum(g, np.maximum(r, b)), g)
rgba = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
ys, xs = np.nonzero(alpha > .5)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
print('src', im.shape[1], im.shape[0], 'bbox', x0, y0, x1 - x0, y1 - y0)
crop = Image.fromarray(rgba).crop((x0, y0, x1, y1))
side = max(crop.size)
crop = crop.resize((side, side), Image.LANCZOS)   # 把略扁的外接框拉成正方
final = crop.resize((size, size), Image.LANCZOS)
final.save(out_png); final.save(out_webp, 'WEBP', quality=85, method=6)
a = np.array(final)[..., 3]
print('corners alpha', a[0,0], a[0,-1], a[-1,0], a[-1,-1], 'opaque frac', round((a > 250).mean(), 3))
gp = np.array(final).astype(int); vis = gp[...,3] > 20
print('green-spill px', int(((gp[...,1] - np.maximum(gp[...,0], gp[...,2]) > 25) & vis).sum()))
