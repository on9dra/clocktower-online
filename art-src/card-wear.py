# 介紹卡牌的磨損層 public/img/art/card-wear.webp：透明圖，九宮格貼在牌面最上面。
# 邊緣髒、邊角磨掉墨、幾處黃斑、一道淺摺痕。全程序生成，跑一遍即可：python art-src/card-wear.py
import numpy as np
from PIL import Image

W, H = 1280, 960
rng = np.random.default_rng(1868)
DIRT, RUB = (92, 66, 34), (236, 228, 212)


def blur(a, s):
    """週期高斯模糊（FFT），大圖也快"""
    fy, fx = np.fft.fftfreq(a.shape[0])[:, None], np.fft.rfftfreq(a.shape[1])[None, :]
    g = np.exp(-2 * (np.pi * s) ** 2 * (fx ** 2 + fy ** 2))
    return np.fft.irfft2(np.fft.rfft2(a) * g, s=a.shape)


def noise(s):
    n = blur(rng.standard_normal((H, W)), s)
    return n / n.std()


rgb = np.zeros((H, W, 3))
alpha = np.zeros((H, W))


def over(color, a):
    """把一層顏色疊上去（a 是這層的不透明度）"""
    global rgb, alpha
    a = np.clip(a, 0, 1)
    out = a + alpha * (1 - a)
    rgb = (np.array(color) * a[..., None] + rgb * (alpha * (1 - a))[..., None]) / np.maximum(out, 1e-5)[..., None]
    alpha = out


y, x = np.mgrid[0:H, 0:W]
edge = np.minimum.reduce([x, y, W - 1 - x, H - 1 - y]).astype(float)
corner = np.minimum.reduce([np.hypot(px, py) for px in (x, W - 1 - x) for py in (y, H - 1 - y)])

# 手摸得最多的一圈：顆粒狀的髒，邊上密、往裏疏；大片的色階交給 CSS 漸變，這裏只放有顆粒的東西
patch = np.clip(.5 + noise(38) * .34, 0, 1)
grit = np.clip(noise(1.6) * .5 + .62, 0, 1)
over(DIRT, np.exp(-edge / 9) * patch * grit * .5)
over(DIRT, np.exp(-corner / 34) * grit * .38)

# 黃斑：不規則的小斑塊，只長在幾片區域裏，大小不一；疊在字上也不能妨礙閱讀，所以很淡
zone = np.clip(noise(64) - .95, 0, 1)
fox = np.clip(noise(2.2) - 1.75, 0, 1) * 1.1 + np.clip(noise(4.5) - 2.2, 0, 1) * .9
over((126, 82, 34), np.clip(fox * zone * 1.2, 0, .2))
over((126, 82, 34), np.clip(blur(fox * zone, 6) * 1.6, 0, .06) * grit)

# 一道淺摺痕：暗線貼一條亮線，斷斷續續
line = np.zeros((H, W))
for (x0, y0, x1, y1) in ((905, -30, 1230, 550), (-25, 745, 335, 985)):
    t = np.linspace(0, 1, 2400)
    px = (x0 + (x1 - x0) * t + np.sin(t * 7) * 5).astype(int)
    py = (y0 + (y1 - y0) * t + np.cos(t * 5) * 5).astype(int)
    keep = (px >= 0) & (px < W) & (py >= 0) & (py < H)
    line[py[keep], px[keep]] = 1
gap = np.clip(noise(26) * .7 + .55, 0, 1)
over(DIRT, np.clip(blur(line, .9) * 1.3, 0, 1) * gap * .2)
over(RUB, np.clip(blur(np.roll(line, (2, 2), (0, 1)), .9) * 1.3, 0, 1) * gap * .34)

# 磨掉的墨：高頻噪聲取尖，越靠邊、越靠角越多
rub = np.clip(noise(1.2) - 1.25, 0, 1) * 1.3 + np.clip(noise(3) - 1.4, 0, 1)
reach = np.clip(np.exp(-edge / 15) * (.5 + np.clip(noise(40), 0, 1.3) * .6) + np.exp(-corner / 50), 0, 1)
over(RUB, rub * reach)

# 紙纖維：細短的小毛
fib = Image.new('L', (W, H), 0)
px = fib.load()
for _ in range(110):
    fx, fy, ang = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(0, 6.28)
    for k in range(int(rng.integers(8, 26))):
        ang += rng.normal(0, .16)
        fx, fy = fx + np.cos(ang), fy + np.sin(ang)
        px[int(fx) % W, int(fy) % H] = 255
over(DIRT, blur(np.asarray(fib, float) / 255, .55) * .14)

alpha[alpha < .012] = 0  # 幾乎看不見的地方全透明，壓縮小得多
out = np.dstack([rgb, alpha * 255]).round().clip(0, 255).astype('uint8')
Image.fromarray(out, 'RGBA').save('public/img/art/card-wear.webp', quality=45, method=6, alpha_quality=50)
