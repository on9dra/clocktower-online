# 規則書和介紹卡的印刷素材 public/img/print/*：全程序生成，跑一遍即可：python -I art-src/print-kit.py [名字…]
# 所有線都不是畫出來的：先在大圖上畫版（覆蓋圖 m），再過 press()「印」一遍——邊緣吃進紙裏、尖角變圓、
# 實地中間淡邊上濃；線條帶壓痕（上左暗、下右亮）。橫向素材用週期噪聲，repeat-x 看不出接縫。
# 不做舊：污漬、漏墨蓋在內容上會妨礙閱讀，而且不跟著紙走，舊只體現在紙張本身
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = 'public/img/print'
K = 2   # 成品每 CSS 像素幾個圖像像素
SS = 2  # 再超採樣幾倍
U = K * SS
INK, RED, BRICK = (42, 36, 31), (146, 38, 28), (118, 56, 42)
PAPER = (231, 224, 208)
rng = np.random.default_rng(1868)


def blur(a, s):
    """週期高斯模糊（FFT），大圖也快"""
    fy, fx = np.fft.fftfreq(a.shape[0])[:, None], np.fft.rfftfreq(a.shape[1])[None, :]
    g = np.exp(-2 * (np.pi * s) ** 2 * (fx ** 2 + fy ** 2))
    return np.fft.irfft2(np.fft.rfft2(a) * g, s=a.shape)


def noise(shape, s):
    n = blur(rng.standard_normal(shape), s)
    return n / n.std()


def wobble(n, amp, s):
    """週期的一維抖動（很短的線不抖）"""
    return noise((1, n), s)[0] * amp if n > s * 6 else np.zeros(n)


def down(a, f=SS):
    h, w = a.shape[0] // f, a.shape[1] // f
    return a[:h * f, :w * f].reshape(h, f, w, f, *a.shape[2:]).mean((1, 3))


def press(m, rough=.08, squeeze=.18, salt=.08, gain=4.):
    """把覆蓋圖 m（0…1）印成墨：返回墨量"""
    s = U / 4
    soft = blur(m, 1.5 * s)
    t = .5 + noise(m.shape, 1.2 * s) * rough * .6 + noise(m.shape, 5 * s) * rough
    a = np.clip((soft - t) * gain + .5, 0, 1) * (soft > .04)
    wide = blur(m, 8 * s)
    d = .94 + noise(m.shape, 16 * s) * .04 - (wide > .8) * squeeze * .6 + np.clip(soft - wide, 0, 1) * squeeze
    holes = np.clip(noise(m.shape, 1.1 * s) - 2.5 + noise(m.shape, 40 * s) * .4, 0, 1) * 3 * salt
    return a * np.clip(d, 0, 1) * (1 - np.clip(holes, 0, 1))


def rgba(layers, m=None, bite=1.):
    """由下到上疊幾層 (墨量, 顏色)，最下面墊壓痕，輸出直通 alpha 的成品（已縮到 K 倍）"""
    h, w = layers[0][0].shape
    rgb, alpha = np.zeros((h, w, 3)), np.zeros((h, w))

    def over(col, a):
        nonlocal rgb, alpha
        a = np.clip(a, 0, 1)
        out = a + alpha * (1 - a)
        rgb = (np.array(col, float) * a[..., None] + rgb * (alpha * (1 - a))[..., None]) / np.maximum(out, 1e-5)[..., None]
        alpha = out

    if m is not None and bite:  # 壓痕：下右受光、上左背光
        b = blur(m, 2.2 * U / 4)
        gy, gx = np.gradient(b)
        l = (gx + gy) * U * 1.1
        over((255, 250, 236), np.clip(l, 0, 1) * .75 * bite)
        over((70, 50, 30), np.clip(-l, 0, 1) * .24 * bite)
    for a, col in layers:
        over(col, a)
    r, a = down(rgb * alpha[..., None]), down(alpha)
    return np.dstack([r / np.maximum(a, 1e-5)[..., None], a * 255]).clip(0, 255).astype('uint8')


def save(name, arr, q=82):
    im = Image.fromarray(arr)
    im.save(f'{OUT}/{name}.webp', quality=q, method=6, alpha_quality=80 if im.mode == 'RGBA' else 100)
    print(name, im.size)


def canvas(w, h):
    im = Image.new('L', (int(w * U), int(h * U)), 0)
    return im, ImageDraw.Draw(im)


def arr(im):
    return np.asarray(im, float) / 255


def line(d, pts, w):
    d.line([(x * U, y * U) for x, y in pts], 255, max(1, round(w * U)), joint='curve')


def rule(d, x0, y0, x1, y1, w, amp=.5):
    """手刻的線：中線慢慢漂，兩條邊各抖各的。長度是整段的週期，首尾對得上"""
    n = int(max(abs(x1 - x0), abs(y1 - y0)))
    t = np.arange(n + 1)
    drift, a, b = wobble(n, amp, 70), wobble(n, .32, 10), wobble(n, .32, 10)
    drift, a, b = (np.append(v, v[0]) for v in (drift, a, b))
    fat = w * (1 + wobble(n, .1, 34))
    fat = np.append(fat, fat[0])
    hor = abs(x1 - x0) > abs(y1 - y0)
    us, vs = x0 + (x1 - x0) * t / n, y0 + (y1 - y0) * t / n
    up = [(u, v + drift[i] + a[i] - fat[i] / 2) if hor else (u + drift[i] + a[i] - fat[i] / 2, v) for i, (u, v) in enumerate(zip(us, vs))]
    dn = [(u, v + drift[i] + b[i] + fat[i] / 2) if hor else (u + drift[i] + b[i] + fat[i] / 2, v) for i, (u, v) in enumerate(zip(us, vs))]
    d.polygon([(x * U, y * U) for x, y in up + dn[::-1]], fill=255)


def nicks(d, x0, y0, x1, y1, n, w):
    """斷版：線上幾處缺口"""
    for _ in range(n):
        t = rng.random()
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        s = rng.uniform(.6, 2.2)
        d.ellipse(((x - s) * U, (y - w) * U, (x + s) * U, (y + w) * U) if x1 != x0 else ((x - w) * U, (y - s) * U, (x + w) * U, (y + s) * U), fill=0)


def cable(d, x0, x1, y, a, lam, n, w, vert=False):
    """車花帶：幾股正弦線絞在一起，到處是交叉的細線，整數個波長保證接得上"""
    k = max(1, round((x1 - x0) / lam))
    lam = (x1 - x0) / k
    xs = np.arange(x0, x1 + .5, .4)
    for i in range(n):
        ph = i / n * 2 * np.pi
        ys = y + a * np.sin((xs - x0) * 2 * np.pi / lam + ph)
        line(d, [(v, u) if vert else (u, v) for u, v in zip(xs, ys)], w)


def rosette(d, cx, cy, R, p, n, w):
    t = np.linspace(0, 2 * np.pi, 720)
    for i in range(n):
        r = R * (.68 + .32 * np.sin(p * t + i / n * 2 * np.pi))
        line(d, list(zip(cx + r * np.cos(t), cy + r * np.sin(t))), w)


# ———— 紙 ————
def paper():
    """簾紋紙：一排排細密的簾紋、隔一段一道粗的簾線，纖維、深淺不勻和草屑"""
    n = 640
    y, x = np.mgrid[0:n, 0:n]
    laid = np.sin(y * 2 * np.pi / (n / 240)) * .9 + np.sin(x * 2 * np.pi / (n / 10)) ** 60 * 1.7
    im = Image.new('L', (n * 2, n * 2), 128)
    d = ImageDraw.Draw(im)
    for _ in range(1500):
        px, py, a, l = rng.uniform(0, n * 2), rng.uniform(0, n * 2), rng.uniform(0, math.tau), rng.uniform(10, 46)
        bend, pts = rng.uniform(-.05, .05), []
        for t in range(int(l)):
            pts.append((px, py))
            px += math.cos(a) * 2
            py += math.sin(a) * 2
            a += bend
        d.line(pts, int(rng.choice([110, 118, 140, 150])), 1)
    fib = blur(down(arr(im), 2) - 128 / 255, .55) * 9
    v = noise((n, n), 46) * 1.5 + noise((n, n), 7) * .8 + noise((n, n), .8) * 1.3 + laid * .75 + fib * 26
    shive = np.clip(noise((n, n), .9) - 3.6, 0, 1) * 34
    out = np.array(PAPER, float)[None, None] + (v - shive)[..., None]
    save('paper', out.clip(0, 255).astype('uint8'), 80)


# ———— 線 ————
def strip(name, h, draw, L=1200, bite=1.):
    im, d = canvas(L, h)
    draw(d, L)
    m = arr(im)
    save(name, rgba([(press(m), INK)], m, bite))


def rules():
    y = lambda h: h / 2
    strip('rule-thin', 7, lambda d, L: (rule(d, 0, 3.5, L, 3.5, 1.15, .5), nicks(d, 0, 3.5, L, 3.5, 2, 1.5)))
    strip('rule-mid', 8, lambda d, L: (rule(d, 0, 4, L, 4, 2.1, .55), nicks(d, 0, 4, L, 4, 2, 2)))
    # 文武線：一粗一細
    strip('rule-wenwu', 13, lambda d, L: (rule(d, 0, 4, L, 4, 3.6, .55), rule(d, 0, 9.5, L, 9.5, 1.15, .5), nicks(d, 0, 4, L, 4, 2, 2.6), nicks(d, 0, 9.5, L, 9.5, 2, 1.5)))

    def dash(d, L):  # 撕線：一段段手排的短劃，長短不勻
        x = 0.
        while x < L - 8:
            w = rng.uniform(5.5, 8.5)
            rule(d, x, 3.5, x + w, 3.5, 1.5, .12)
            x += w + rng.uniform(3.6, 5.2)
    strip('rule-dash', 7, dash)

    def vert(name, src):
        a = np.asarray(Image.open(f'{OUT}/{src}.webp').convert('RGBA'))
        save(name, np.rot90(a))
    vert('rule-thin-v', 'rule-thin')


def perf():
    """打孔撕線：一排穿透的圓孔，孔裏是暗的，孔沿上受光"""
    L, h, step = 1200, 14, 12
    im = Image.new('RGBA', (L * K, h * K), (0, 0, 0, 0))
    a = np.zeros((h * U, L * U, 4))
    y, x = np.mgrid[0:h * U, 0:L * U]
    n = L // step
    jit = rng.normal(0, .12, n + 1)
    jit[-1] = jit[0]
    u = ((x / U) % step - step / 2)
    i = (x / U // step).astype(int)
    d = np.hypot(u + jit[i] * 1.6, y / U - h / 2 + jit[(i + 3) % n])
    hole = np.clip((3.15 - d) * 3, 0, 1)
    rim = np.clip((3.9 - d) * 2, 0, 1) * (1 - hole)
    lit = np.clip((y / U - h / 2) / 3.4, -1, 1)
    rgb = np.array((30, 22, 16), float) * np.ones((*hole.shape, 3))
    rgb = rgb * hole[..., None] + (np.array((255, 248, 232), float) * (lit > 0)[..., None] + np.array((90, 66, 40), float) * (lit <= 0)[..., None]) * (1 - hole)[..., None]
    al = hole * .82 + rim * np.abs(lit) * .55
    r, al = down(rgb * al[..., None]), down(al)
    save('perf', np.dstack([r / np.maximum(al, 1e-5)[..., None], al * 255]).clip(0, 255).astype('uint8'))


# ———— 版框 ————
def frame():
    """一頁的版框：外面一道粗線，中間磚紅的車花帶，裏面一道細線，一共 20px 寬，把地方留給內容；四角木刻方塊。九宮格用"""
    W, H = 900, 650
    im, d = canvas(W, H)
    br, bd = canvas(W, H)
    o, g = 2.4, 17.6
    for x0, y0, x1, y1 in ((o - 1, o, W - o + 2, o), (o - 2, H - o, W - o + 1, H - o), (o, o - 2, o, H - o + 1), (W - o, o - 1, W - o, H - o + 2)):
        rule(d, x0, y0, x1, y1, 3.2, .4)
        nicks(d, x0, y0, x1, y1, 2, 2.4)
    for x0, y0, x1, y1 in ((g, g, W - g, g), (g, H - g, W - g, H - g), (g, g, g, H - g), (W - g, g, W - g, H - g)):
        rule(d, x0, y0, x1, y1, 1, .3)
        nicks(d, x0, y0, x1, y1, 2, 1.3)
    c = 10
    cable(bd, 22, W - 22, c, 3, 14, 3, .5)
    cable(bd, 22, W - 22, H - c, 3, 14, 3, .5)
    cable(bd, 22, H - 22, c, 3, 14, 3, .5, vert=True)
    cable(bd, 22, H - 22, W - c, 3, 14, 3, .5, vert=True)
    # 四角：實心方塊上刻出一朵車花
    for cx, cy in ((c, c), (W - c, c), (c, H - c), (W - c, H - c)):
        d.rectangle(((cx - 9.5) * U, (cy - 9.5) * U, (cx + 9.5) * U, (cy + 9.5) * U), fill=255)
    cut, cd = canvas(W, H)
    for cx, cy in ((c, c), (W - c, c), (c, H - c), (W - c, H - c)):
        rosette(cd, cx, cy, 7.4, 6, 6, .5)
        cd.ellipse(((cx - 1.2) * U, (cy - 1.2) * U, (cx + 1.2) * U, (cy + 1.2) * U), fill=255)
    m = np.clip(arr(im) - arr(cut), 0, 1)
    b = arr(br)
    save('frame', rgba([(press(b, rough=.05, squeeze=.1, gain=3), BRICK), (press(m), INK)], np.maximum(m, b * .4)), 66)


def block():
    """大紅木刻方塊：章的印記，磚邊不齊，四周一圈刻線；圖標或數字反白壓在上面"""
    n = 96
    im, d = canvas(n, n)
    pts = [(5 + rng.uniform(-.8, .8), 5 + rng.uniform(-.8, .8)), (n - 5 + rng.uniform(-.8, .8), 5 + rng.uniform(-.8, .8)),
           (n - 5 + rng.uniform(-.8, .8), n - 5 + rng.uniform(-.8, .8)), (5 + rng.uniform(-.8, .8), n - 5 + rng.uniform(-.8, .8))]
    d.polygon([(x * U, y * U) for x, y in pts], fill=255)
    cut, cd = canvas(n, n)
    for a, b, e, f in ((12, 12, n - 12, 12), (n - 12, 12, n - 12, n - 12), (n - 12, n - 12, 12, n - 12), (12, n - 12, 12, 12)):
        rule(cd, a, b, e, f, 1.25, .3)
    for k in range(13):  # 四角的斜刻線
        for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            cx, cy = (n / 2 - sx * (n / 2 - 13), n / 2 - sy * (n / 2 - 13))
            line(cd, [(cx + sx * k * 1.2, cy), (cx, cy + sy * k * 1.2)], .55)
    m = np.clip(arr(im) - arr(cut), 0, 1)
    save('block', rgba([(press(m, rough=.1, squeeze=.22, salt=.2, gain=3.2), RED)], m, .8))


def head():
    """版頭：小鎮天際線刻成一道道粗細不一的橫線。線的粗細就是明暗，右邊最實，往左淡出好讓位給標題"""
    W, H = 880, 72
    t = Image.open('public/img/art/town-near-day.webp').convert('RGBA')
    bg = Image.new('RGBA', t.size, (255, 255, 255, 255))
    bg.alpha_composite(t)
    t = bg.convert('L').crop((0, int(t.height * .12), t.width, t.height))
    t = t.resize((W * U, int(W * U * t.height / t.width)), Image.LANCZOS)
    g = 1 - arr(t)
    g = g[-H * U:] if g.shape[0] > H * U else np.pad(g, ((H * U - g.shape[0], 0), (0, 0)))
    y, x = np.mgrid[0:H * U, 0:W * U]
    warp = noise(g.shape, 30) * 1.2 * U / 4
    wave = .5 + .5 * np.sin((y + warp) * 2 * np.pi / (2.5 * U))
    fade = np.clip((x / (W * U) - .34) / .22, 0, 1)
    m = ((np.clip(g * 1.08, 0, 1) ** .8) * fade > wave + .02).astype(float)
    m = blur(m, .6) > .5
    a = press(m.astype(float), rough=.05, squeeze=.1, gain=3)
    save('head', rgba([(a * .9, INK)], m.astype(float), .25))


# ———— 紙張之外 ————
def fore():
    """書口：一張張紙的邊，亮暗不一，隔一段是一帖的分界"""
    L, W = 640, 28
    a = rng.normal(0, 1, (L * 1, W))
    a = blur(a, 0.01)
    col = blur(rng.standard_normal((1, W * 4)), .6)[0]
    col = (col / col.std()) * 16
    sig = np.sin(np.arange(W * 4) * 2 * np.pi / 22) ** 8 * -18
    tone = np.array(PAPER, float) - 22
    img = np.zeros((L, W * 4, 3)) + tone
    wav = noise((L, W * 4), 26)
    x = np.arange(W * 4)[None, :] + wav * 1.4
    v = np.interp(x.ravel() % (W * 4), np.arange(W * 4), col + sig, period=W * 4).reshape(L, W * 4)
    img += v[..., None] + noise((L, W * 4), .8)[..., None] * 3
    out = down(img, 2)  # 2 倍圖
    save('fore', out.clip(0, 255).astype('uint8'), 78)
    save('fore-h', np.rot90(out).clip(0, 255).astype('uint8'), 78)


def cloth():
    """封面布：粗紋書布，經緯一上一下，深牛血色"""
    n = 320
    y, x = np.mgrid[0:n, 0:n]
    px = 4
    warp = noise((n, n), 9) * .5
    a = np.sin((x + warp) * 2 * np.pi / px)
    b = np.sin((y - warp) * 2 * np.pi / px)
    check = np.sign(np.sin(x * np.pi / px) * np.sin(y * np.pi / px))
    weave = np.where(check > 0, a, b)
    v = weave * 9 + noise((n, n), 34) * 5 + noise((n, n), 3) * 4 + noise((n, n), .7) * 3
    out = np.array((58, 40, 34), float)[None, None] + v[..., None] * np.array((1, .86, .8))
    save('cloth', out.clip(0, 255).astype('uint8'), 74)


def hatch():
    """夜晚的示意圖：實地上留出一道道細白線，比純色的深藍像印出來的"""
    n = 120
    im, d = canvas(n, n)
    for k in range(-n // 4, n // 4 + 6):
        x = k * 4.
        line(d, [(x + t, t + wobble_at(t + k * 31)) for t in range(0, n + 1, 3)], .8)
    dark = 1 - np.clip(blur(arr(im), 1.1) * 1.7, 0, 1)
    save('hatch-dark', down(np.dstack([np.full(dark.shape, c, float) for c in (40, 38, 46)] + [dark * .95 * 255])).clip(0, 255).astype('uint8'), 70)


def box():
    """插圖的框：鴨嘴筆畫的線，角上出頭。九宮格用"""
    n, e = 240, 22
    im, d = canvas(n, n)
    for x0, y0, x1, y1 in ((e - 7, e, n - e + 8, e), (e - 8, n - e, n - e + 6, n - e), (e, e - 8, e, n - e + 7), (n - e, e - 6, n - e, n - e + 8)):
        rule(d, x0, y0, x1, y1, 1.1, .28)
    m = arr(im)
    save('box', rgba([(press(m), INK)], m, .7))


def wobble_at(t):
    return math.sin(t * .13) * .35 + math.sin(t * .051 + 1.3) * .5


JOBS = dict(paper=paper, rules=rules, perf=perf, frame=frame, block=block, head=head, fore=fore, cloth=cloth, hatch=hatch, box=box)
for name in sys.argv[1:] or JOBS:
    JOBS[name]()
