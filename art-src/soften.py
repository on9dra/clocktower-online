# 把素材裏的紅色壓柔和：只動紅色像素（黃銅、墨線不動），降飽和、壓亮部、往棕裏偏一點
# 用法：python -I art-src/soften.py 輸入 輸出.webp [飽和係數] [亮部係數]
import sys, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
k = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6     # 飽和度保留比例
v = float(sys.argv[4]) if len(sys.argv) > 4 else 0.82    # 亮度上限壓縮
im = Image.open(src); alpha = im.getchannel('A') if im.mode == 'RGBA' else None
a = np.asarray(im.convert('RGB')).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
red = np.clip((r - np.maximum(g, b) - 30) / 40, 0, 1)[..., None]   # 越紅越受影響，邊緣平滑過渡
gray = (0.3 * r + 0.59 * g + 0.11 * b)[..., None]
soft = gray + (a - gray) * k                      # 降飽和
soft = soft * v + np.array([6, 3, 0]) * (1 - v)  # 壓亮部，微微偏暖棕
a2 = a * (1 - red) + soft * red
res = Image.fromarray(a2.clip(0, 255).astype(np.uint8))
if alpha is not None: res.putalpha(alpha)
res.save(out, 'WEBP', quality=84, method=6)
