# 社區劇本庫的角色圖：把博物館 Json 裏自製角色的 image（別人圖床上的大圖，一張 100–600 KB，一半已經失效）
# 下載下來，裁掉四周的空白、縮成 120px 的 webp，放進 public/community/i/<網址 sha1 前 12 位>.webp。
# 用法：先跑 node tools/community-build.mjs <目錄>（會寫出還缺的圖的清單 tools/community-icons.todo），
#       再跑 python tools/community-icons.py，最後再跑一次 community-build 把圖掛上。下載不到的角色照舊用名字的第一個字
import hashlib, io, os, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'public', 'community', 'i')
TODO = os.path.join(ROOT, 'tools', 'community-icons.todo')
SIZE = 96

def thumb(raw):
    im = Image.open(io.BytesIO(raw))
    im.load()
    im = im.convert('RGBA')
    box = im.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
    if not box: return None
    opaque = box == (0, 0, *im.size) and im.getchannel('A').getextrema()[0] > 200
    im = im.crop(box)
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq = sq.resize((SIZE, SIZE), Image.LANCZOS)
    if opaque:  # 不透明的整張圖（照片、插畫）：裁成圓的，和圓牌一個形狀
        big = Image.new('L', (SIZE * 4, SIZE * 4), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(big).ellipse((0, 0, SIZE * 4 - 1, SIZE * 4 - 1), fill=255)
        sq.putalpha(big.resize((SIZE, SIZE), Image.LANCZOS))
    return sq

down = {}  # 整個圖床連不上的（連續 6 次超時）：後面的不再等
def one(url):
    host = url.split('/')[2]
    if down.get(host, 0) >= 6: return 'dead'
    name = hashlib.sha1(url.encode()).hexdigest()[:12] + '.webp'
    dst = os.path.join(OUT, name)
    if os.path.exists(dst): return 'have'
    try:
        req = urllib.request.Request(url.replace('http://', 'https://', 1), headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as r:
            if r.status != 200: return 'dead'
            raw = r.read(8 << 20)
        down[host] = 0
        im = thumb(raw)
        if im is None: return 'empty'
        im.save(dst, 'WEBP', quality=72, method=6)
        return 'ok'
    except urllib.error.HTTPError:
        down[host] = 0
        return 'dead'
    except Exception:
        down[host] = down.get(host, 0) + 1
        return 'dead'

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    urls = [u for u in open(TODO, encoding='utf-8').read().split('\n') if u]
    if len(sys.argv) > 1: urls = urls[:int(sys.argv[1])]
    n = {}
    with ThreadPoolExecutor(12) as ex:
        for i, r in enumerate(ex.map(one, urls)):
            n[r] = n.get(r, 0) + 1
            if i % 200 == 199: print(i + 1, '/', len(urls), n, flush=True)
    print('完成', n)
