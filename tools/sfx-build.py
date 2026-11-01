#!/usr/bin/env python3
"""做 public/sfx/*.m4a：錄音截取、對齊起音、收尾；樂器音校準音高後疊成結算音；響度寫進文件，轉 AAC。
用法：python tools/sfx-build.py 原始音頻目錄 [只做這些名字...]
需要 ffmpeg 和 numpy。Freesound 的原始文件名是 <用途>-<編號>.ogg，樂器採樣第一次用時從 GitHub 下到 原始音頻目錄/inst，來源和授權見 docs/sfx-sources.md"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import wave

import numpy as np

SR = 48000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'sfx')
MASTER_DB = 20 * np.log10(0.6 * 0.8)  # sfx.js 的總音量，下面 LEVEL 是過了它之後的響度

# 最響 100ms 的 RMS（dBFS）。死亡、處決這些重音最響，翻頁、嘀嗒這種出現得頻繁的壓低
LEVEL = {
    'thud': -20, 'good': -21, 'evil': -22, 'rope': -22, 'slash': -22, 'stab': -23, 'stamp': -23,
    'tock': -24, 'demon': -24, 'dawn': -24, 'zap': -24, 'beat2': -24, 'clang': -25,
    'crack': -26, 'rumble': -26, 'tag': -26, 'nominate': -24, 'crown': -27, 'turn': -27, 'splat': -27,
    'caw': -28, 'flip': -28, 'cork': -28, 'hum': -28, 'bell': -28, 'splash': -28, 'dig': -28,
    'fire': -30, 'clip': -30, 'drip': -30, 'key': -30, 'miss': -30, 'shimmer': -30, 'fw': -30, 'smack': -30, 'unlock': -30,
    'swish': -31, 'whoosh': -32, 'hiss': -32, 'rattle': -32, 'flap': -33, 'tick': -33, 'page': -34, 'sniff': -34, 'leaf': -36,
}

# 輸出名: (原始文件, 起點秒, 長度秒, 淡出秒, 變速倍數, 高通 Hz)
TAKES = {
    'tock': ('tock-470710', .46, .4, .12, 1, 50),
    'page': ('page-397548', 0, .5, .08, 1, 200),
    'caw': ('caw-361470', 0, .43, .06, 1, 200),
    'demon': ('demon-320345', 2.85, 1.6, .4, .75, 30),
    'beat2': ('beat2-116642', 0, .55, .1, 1, 30),
    'bell': ('bell-452379', 0, 1.2, .5, 1, 300),
    'crack': ('crack-164472', .1, .4, .1, 1, 100),
    'dig': ('dig-651293', 0, .4, .1, 1, 80),
    'fire': ('fire-186932', 1.15, .9, .4, 1, 60),
    'fw': ('fw-264031', 0, 1.4, .7, 1, 40),
    'slash': ('slash-323526', .05, .55, .15, 1, 100),
    'smack': ('smack-430594', .12, .2, .06, 1, 200),
    'sniff': ('sniff-151218', .1, .45, .1, 1, 200),
    'splash': ('splash-398032', .1, .6, .3, 1, 100),
    'splat': ('splat-445109', 0, .33, .12, 1, 80),
    'stab': ('stab-179222', .13, .55, .2, 1, 80),
    'swish': ('swish-347237', .3, 1, .3, 1, 100),
    'thud': ('thud-346695', .55, .6, .2, 1, 35),
    'unlock': ('unlock-494128', .4, .28, .08, 1, 200),
    'zap': ('zap-136542', 0, .6, .15, 1, 150),
    'whoosh': ('whoosh-496188', 0, .5, .15, 1, 120),
    'clip': ('clip-667382', 0, .2, .06, 1, 200),
    'cork': ('cork-392624', .1, .4, .15, 1, 100),
    'drip': ('drip-174718', 0, .4, .1, 1, 150),
    'flap': ('flap-240469', 0, .6, .1, 1, 120),
    'flip': ('flip-84322', .25, .6, .12, 1, 150),
    'hiss': ('hiss-241562', .25, .5, .2, 1, 300),
    'leaf': ('page-82379', 0, .2, .06, 1, 200),
    'miss': ('miss-394186', 0, .2, .06, 1, 150),
    'rattle': ('rattle-460153', 0, .35, .08, 1, 200),
    'rumble': ('rumble-222517', 0, 1, .5, 1, 30),
}

# 樂器包：名字: (倉庫, 路徑正則)。都是 CC0
PACKS = {
    'tubasus': ('VSCO-2-CE', r'Brass/Tuba/sus/.*_v3_rr1_Mid\.wav'),
    'cellosus': ('VSCO-2-CE', r'Strings/Cello Section/susvib/.*_v3_1\.wav'),
    'bass': ('VSCO-2-CE', r'Strings/Solo Contrabass/SusNV/.*_v3_rr1\.wav'),
    'harp': ('VSCO-2-CE', r'Strings/Harp/KSHarp_.*\.wav'),
    'gong': ('VSCO-2-CE', r'Percussion/gongHit_p\.wav'),
    'timphit': ('VSCO-2-CE', r'Percussion/Timpani/Timpani3_Hit_v3_rr1_Sum\.wav'),
    'timproll': ('VSCO-2-CE', r'Percussion/Timpani/Rolls/Timpani2_Roll_v3_rr1_Sum\.wav'),
    'cymrise': ('VSCO-2-CE', r'Percussion/susCymb1-cresc-Short_v1\.wav'),
    'tremolo': ('VSCO-2-CE', r'Strings/Cello Section/trem/.*_v1_1\.wav'),
    'spic': ('VSCO-2-CE', r'Strings/Cello Section/spic/spic_.*_v2_RR1\.wav'),
    'bassspic': ('VSCO-2-CE', r'Strings/Solo Contrabass/Spic/.*_v3_rr1\.wav'),
    'marimba': ('VCSL', r'Struck Idiophones/Marimba/.*_med_01\.wav'),
    'glock': ('VCSL', r'Glockenspiel/glock_medium_.*_01\.wav'),
    'chime': ('VCSL', r'Hand Chimes/sus_.*_r01_main\.wav'),
    'glass': ('VCSL', r'Wine Glasses/Sustains/Fast/glass3_.*\.wav'),
    'belltree': ('VCSL', r'Bell Tree/Stroke/BellTree_Stroke_3_Mid\.wav'),
    'wood': ('VCSL', r'Woodblock/wood_click_mp\.wav'),
    'anvil': ('VCSL', r'Anvil/Anvil_Hit1_v2_rr1_Mid\.wav'),
}
raw_dir = None


def read_any(path):
    data = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(data, dtype='<f4').copy()


def tree(repo):
    path = os.path.join(raw_dir, 'inst', repo + '.tree.json')
    if not os.path.exists(path):
        url = f'https://api.github.com/repos/sgossner/{repo}/git/trees/master?recursive=1'
        urllib.request.urlretrieve(url, path)
    return [x['path'] for x in json.load(open(path, encoding='utf-8'))['tree'] if x['type'] == 'blob']


def fetch(url, local):
    for tries in range(6):
        try:
            urllib.request.urlretrieve(url, local + '.part')
            os.replace(local + '.part', local)
            return
        except OSError:
            time.sleep(2 + tries * 3)
    raise SystemExit('下載失敗：' + url)


def pack_files(name):
    repo, pattern = PACKS[name]
    out = []
    for rel in tree(repo):
        if not re.search(pattern, rel):
            continue
        local = os.path.join(raw_dir, 'inst', repo, rel.replace('/', os.sep))
        if not os.path.exists(local) or os.path.getsize(local) < 2000:
            os.makedirs(os.path.dirname(local), exist_ok=True)
            fetch(f'https://raw.githubusercontent.com/sgossner/{repo}/master/' + urllib.parse.quote(rel), local)
        out.append(local)
    if not out:
        raise SystemExit('沒有文件：' + name)
    return out


def trim_onset(x):
    level = np.abs(x).max() * .05
    first = int(np.argmax(np.abs(x) > level))
    return x[max(first - int(SR * .002), 0):]


def resample(x, ratio):
    return np.interp(np.arange(0, len(x) - 1, ratio), np.arange(len(x)), x)


def glide(x, start, end):
    """音高從 start 倍滑到 end 倍"""
    steps = np.linspace(start, end, len(x))
    pos = np.cumsum(steps)
    pos = pos[pos < len(x) - 1]
    return np.interp(pos, np.arange(len(x)), x)


def yin(x):
    """穩定段的基頻（自相關差分）"""
    seg = x[int(.08 * SR):int(.08 * SR) + int(.3 * SR)]
    if len(seg) < int(.12 * SR):
        seg = x[:int(.3 * SR)]
    lo, hi = int(SR / 2200), min(int(SR / 26), len(seg) // 2)
    n = len(seg) - hi
    d = np.array([np.sum((seg[:n] - seg[t:t + n]) ** 2) for t in range(1, hi)])
    cum = d * np.arange(1, hi) / np.maximum(np.cumsum(d), 1e-9)
    for t in range(lo, len(cum) - 1):
        if cum[t] < .15 and cum[t] < cum[t + 1]:
            a, b, c = cum[t - 1], cum[t], cum[t + 1]
            return SR / (t + 1 + .5 * (a - c) / max(a - 2 * b + c, 1e-9))
    t = lo + int(np.argmin(cum[lo:]))
    return SR / (t + 1)


NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def hz(note):
    return 440 * 2 ** ((NAMES.index(note[:-1]) - 9) / 12 + int(note[-1]) - 4)


def label_hz(path):
    m = re.search(r'[_-]([A-G]#?)(\d)(?=[_.])', os.path.basename(path))
    return hz(m.group(1) + m.group(2)) if m else None


# 定音鼓頻譜最強的峰是 1.5 倍的泛音，聽到的音高是最低的主模態，要照著它校
TIMP_ROOT = {'Timpani2': 121, 'Timpani3': 143, 'Timpani4': 170, 'Timpani5': 197}
STRUCK = {'glock', 'chime', 'vibes', 'harp', 'violapizz', 'marimba'}  # 敲和撥的音自相關測不準，看頻譜峰
cache = {}


def spectral_peak(x, low, high):
    seg = x[:int(SR * .6)] * np.hanning(min(len(x), int(SR * .6)))
    spec = np.abs(np.fft.rfft(seg, n=1 << 18))
    freq = np.fft.rfftfreq(1 << 18, 1 / SR)
    keep = (freq > low) & (freq < high)
    return float(freq[keep][np.argmax(spec[keep])])


def samples(name):
    """[(音高, 波形, 路徑)]。各家標籤的八度不一樣：音名可信，整包的八度偏移取測量的中位數，單個採樣測偏了就退回標籤"""
    if name in cache:
        return cache[name]
    table = []
    for path in pack_files(name):
        x = trim_onset(read_any(path))
        table.append([yin(x), x / max(rms100(x), 1e-6) * .1, path])
    labelled = [(row, label_hz(row[2])) for row in table if label_hz(row[2])]
    if labelled:
        octave = np.median([np.round(np.log2(row[0] / label)) for row, label in labelled])
        for row, label in labelled:
            near = label * 2 ** octave
            if name in STRUCK:
                row[0] = spectral_peak(row[1], near / 1.04, near * 1.04)
            elif abs(1200 * np.log2(row[0] / near)) > 60:
                row[0] = near
    if name == 'timp':
        for row in table:
            row[0] = TIMP_ROOT[os.path.basename(row[2])[:8]]
    cache[name] = table
    return table


def rms100(x):
    if len(x) <= 4800:
        return float(np.sqrt(np.mean(x ** 2)))
    return float(np.sqrt(np.convolve(x ** 2, np.ones(4800) / 4800, 'valid').max()))


def fade_to(x, dur, fade):
    x = x[:int(SR * dur)].copy()
    f = min(int(SR * fade), len(x))
    x[-f:] *= np.cos(np.linspace(0, np.pi / 2, f)) ** 2
    return x


def note(pack, pitch, dur, gain=1.0, fade=.1):
    """最近的採樣校到 pitch（音名或 Hz）。"""
    target = hz(pitch) if isinstance(pitch, str) else pitch
    f, x, _ = min(samples(pack), key=lambda s: abs(np.log2(s[0] / target)))
    return fade_to(resample(x, target / f), dur, fade) * gain


def one(pack, dur, gain=1.0, fade=.1, rate=1.0):
    """不分音高的打擊樂"""
    _, x, _ = samples(pack)[0]
    return fade_to(resample(x, rate) if rate != 1 else x, dur, fade) * gain


def layer(*parts):
    """(延遲秒, 波形) 疊在一起"""
    n = max(int(t * SR) + len(x) for t, x in parts)
    out = np.zeros(n)
    for t, x in parts:
        i = int(t * SR)
        out[i:i + len(x)] += x
    return out


def chord(pack, notes, dur, gain=1.0, fade=.1):
    return layer(*[(0, note(pack, n, dur, gain, fade)) for n in notes])


def arp(pack, notes, step, dur, gain=1.0, fade=.3):
    return layer(*[(i * step, note(pack, n, dur, gain, fade)) for i, n in enumerate(notes)])


def attack(x, sec):
    x = x.copy()
    n = int(SR * sec)
    x[:n] *= np.sin(np.linspace(0, np.pi / 2, n)) ** 2
    return x


def nominate(hit=.84):
    """提名的過渡：定音鼓滾奏和弦樂震音在屬音 A 上推起來，hit 秒時章落下打到主音 D，正好接提名音樂的第一拍（fx.js 的 nominate 按這個時間等）"""
    n = int(SR * hit)
    rise = lambda x: x[:n] * np.linspace(0, 1, n) ** 2.2
    cymbal = samples('cymrise')[0][1]
    peak = int(np.argmax(np.convolve(cymbal ** 2, np.ones(4800) / 4800, 'same')))
    cymbal = cymbal[max(peak - n, 0):peak]
    return layer((0, rise(one('timproll', 1, .9, .05, 110 / 121))), (0, rise(note('tremolo', 'A2', 1, .6, .05))), (hit - len(cymbal) / SR, cymbal * .5),
                 (hit, one('timphit', 1.1, 1, .6, 146.8 / 143)), (hit, note('spic', 'D3', .5, .7, .2)), (hit, note('bassspic', 'D2', .5, .5, .2)))


# 真實樂器疊成的結算音，和幾段錄音疊成的聲音
MUSIC = {
    'nominate': nominate,
    'key': lambda: arp('glock', ['A6', 'C7'], .07, .35, 1, .15),
    'tag': lambda: layer((0, clip('tock-470710', .46, .12, .05, hp=400, lp=5000) * .7), (0, note('marimba', 'A5', .24, 1, .14)), (0, note('glock', 'E7', .3, .3, .2))),
    'stamp': lambda: layer((0, clip('tock-470710', .46, .36, .12, hp=45, lp=900)), (0, clip('tock-683031', .13, .36, .14, hp=40, lp=700) * .9)),
    'good': lambda: layer((0, arp('harp', ['G4', 'C5', 'E5', 'G5', 'C6'], .13, 1.4, 1, .7)), (0, arp('glock', ['G5', 'C6', 'E6', 'G6', 'C7'], .13, 1.2, .5, .6))),
    'evil': lambda: layer((0, attack(chord('bass', ['A1', 'E2'], 3, .9, 1.2), .4)), (0, attack(chord('tubasus', ['A1', 'A#1'], 3, .7, 1.2), .4)), (0, attack(chord('cellosus', ['A2', 'A#2'], 3, .5, 1.2), .4)), (0, one('gong', 3, .2, 1.2))),
    'dawn': lambda: layer((0, arp('harp', ['C5', 'E5', 'G5', 'C6'], .12, .95, 1, .4)), (0, arp('glock', ['C6', 'E6', 'G6', 'C7'], .12, .9, .45, .4))),
    'crown': lambda: arp('glock', ['C6', 'G6'], .09, .75, 1, .4),
    'turn': lambda: note('chime', 'D5', 1.2, 1, .7),
    'hum': lambda: attack(glide(note('glass', 'A#4', .95, 1, .3), 1, 1.12), .15),
    'shimmer': lambda: one('belltree', .9, 1, .4),
    'tick': lambda: one('wood', .07, 1, .03),
    'clang': lambda: one('anvil', .8, 1, .4),
    'rope': lambda: layer((0, clip('rope-664929', 2.2, .95, .25)), (.45, clip('thud-346695', .55, .5, .2, hp=35) * .7)),
}


def decode(path, start, dur, rate, hp, lp=None):
    pitch = f'asetrate={SR * rate},aresample={SR},' if rate != 1 else ''
    af = f'aresample={SR},{pitch}highpass=f={hp}' + (f',lowpass=f={lp}' if lp else '')
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(start), '-t', str((dur + .3) / rate), '-i', path, '-ac', '1', '-af', af, '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype='<f4').copy()


def shape(x, dur, fade):
    peak = np.abs(x).max()
    first = int(np.argmax(np.abs(x) > peak * .03))  # 起音對齊到第 2ms，動畫和聲音才同拍
    x = fade_to(x[max(first - int(SR * .002), 0):], dur, fade)
    x[:int(SR * .001)] *= np.linspace(0, 1, int(SR * .001))
    return x


def clip(src, start, dur, fade, rate=1, hp=100, lp=None):
    """一段錄音，歸一後好疊"""
    x = shape(decode(os.path.join(raw_dir, src + '.ogg'), start, dur, rate, hp, lp), dur, fade)
    return x / rms100(x) * .1


def level(x, name):
    """把響度寫進文件；峰值頂到 -1dB 時寧可輕一點"""
    want = 10 ** ((LEVEL[name] - MASTER_DB) / 20)
    gain = min(want / rms100(x), 10 ** (-1 / 20) / np.abs(x).max())
    short = 20 * np.log10(gain * rms100(x) / want)
    return x * gain, short


def encode(x, out):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'x.wav')
        with wave.open(path, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart', out], check=True)


def main(raw, only):
    global raw_dir
    raw_dir = raw
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(raw, 'inst'), exist_ok=True)
    jobs = {**{k: ('take', v) for k, v in TAKES.items()}, **{k: ('music', v) for k, v in MUSIC.items()}}
    for out_name, (kind, job) in jobs.items():
        if only and out_name not in only:
            continue
        if kind == 'take':
            src, start, dur, fade, rate, hp = job
            x = shape(decode(os.path.join(raw, src + '.ogg'), start, dur, rate, hp), dur, fade)
        else:
            x = np.asarray(job())
        x, short = level(x, out_name)
        out = os.path.join(OUT, out_name + '.m4a')
        encode(x, out)
        warn = f'  差 {short:.1f}dB（峰值到頂）' if short < -1 else ''
        print(f'{out_name:14s} {len(x) / SR:5.2f}s {os.path.getsize(out) / 1024:6.1f}KB{warn}')


if __name__ == '__main__':
    main(sys.argv[1], set(sys.argv[2:]))
