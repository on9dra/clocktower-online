#!/usr/bin/env python3
"""自己編的提名音樂：譜子寫在這裏，用 VSCO 2 CE（CC0）的採樣渲染成 wav，再由 bgm-build.py 定響度、轉 AAC。
用法：python tools/bgm-score.py 原始音頻目錄 輸出目錄 [曲名...]
需要 ffmpeg 和 numpy。採樣第一次用時從 GitHub 下到 原始音頻目錄/inst，來源和授權見 docs/sfx-sources.md"""
import importlib.util
import os
import re
import sys
import wave
from multiprocessing.pool import ThreadPool

import numpy as np

spec = importlib.util.spec_from_file_location('sfx_build', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sfx-build.py'))
sb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sb)
SR = sb.SR
V = 'VSCO-2-CE'

# 樂器包：名字: (路徑正則, 聲像 -1 左 ~ 1 右, 混響量)
PACKS = {
    'cello': (r'Strings/Cello Section/spic/spic_.*\.wav', .2, .12),
    'viola': (r'Strings/Viola Section/spic/.*\.wav', .35, .14),
    'violin': (r'Strings/Violin Section/Spic/.*\.wav', -.4, .16),
    'contra': (r'Strings/Solo Contrabass/Spic/.*_v[13]_rr1\.wav', .3, .1),
    'cellotrem': (r'Strings/Cello Section/trem/.*_v1_1\.wav', .2, .2),
    'violatrem': (r'Strings/Viola Section/trem/.*_v1_rr1\.wav', .35, .2),
    'violintrem': (r'Strings/Violin Section/Trem/.*_v1\.wav', -.4, .22),
    'trumpet': (r'Brass/Trumpet/stac/.*_v3_rr[12]\.wav', -.1, .2),
    'trumpetlong': (r'Brass/Trumpet/sus/.*_v3_rr1\.wav', -.1, .24),
    'horn': (r'Brass/F Horn/stac/.*_v2_rr[12]\.wav', -.25, .2),
    'trombone': (r'Brass/Tenor Trombone/stac/.*_v3_rr1\.wav', .15, .18),
    'tuba': (r'Brass/Tuba/stac/.*_v2_rr1_Sum\.wav', .1, .12),
    'timp': (r'Percussion/Timpani/Timpani[2-5]_Hit_v3_rr[12]_Sum\.wav', 0, .16),
    'snare': (r'Percussion/Snare2-HitSN_v[35]_rr[12]_Sum\.wav', -.1, .12),
    'crash': (r'Percussion/cymbal-crash1_mf_rr1\.wav', .1, .2),
    'swell': (r'Percussion/susCymb1-cresc-Median_v1\.wav', .1, .2),
}
# 短音的測量不穩，音高信標籤（配上整包的八度偏移）
SHORT = {'cello', 'viola', 'violin', 'contra', 'trumpet', 'horn', 'trombone', 'tuba'}
NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi(name):
    m = re.fullmatch(r'([A-G])([#b]?)(-?\d)', name)
    return NOTE[m[1]] + {'#': 1, 'b': -1, '': 0}[m[2]] + (int(m[3]) + 1) * 12


def freq(n):
    return 440 * 2 ** ((n - 69) / 12)


def tier(path):
    m = re.search(r'_v(\d)', os.path.basename(path))
    return int(m[1]) if m else 0


def table(pack):
    rows = sb.samples(pack)
    if pack in SHORT and not getattr(sb, 'fixed_' + pack, False):
        setattr(sb, 'fixed_' + pack, True)
        labelled = [(r, sb.label_hz(r[2])) for r in rows if sb.label_hz(r[2])]
        octave = np.median([np.round(np.log2(r[0] / la)) for r, la in labelled])
        for r, la in labelled:
            r[0] = la * 2 ** octave
    return rows


class Song:
    def __init__(self, bpm, bars, seed=1):
        self.e = 30 / bpm  # 一個八分音符的秒數
        self.size = int(SR * ((bars * 8) * self.e + 4))
        self.bus = {}
        self.rng = np.random.default_rng(seed)
        self.turn = {}
        self.pitched = {}

    def pick(self, pack, f, loud):
        rows = table(pack)
        near = min(abs(np.log2(r[0] / f)) for r in rows)
        same = [r for r in rows if abs(np.log2(r[0] / f)) < near + .03]
        want = max if loud else min
        level = want(tier(r[2]) for r in same)
        group = [r for r in same if tier(r[2]) == level]
        i = self.turn.get(id(group[0]), 0)
        self.turn[id(group[0])] = i + 1
        return group[i % len(group)]

    def put(self, pack, pitch, bar, eighth=0, length=None, gain=1.0, loud=True, release=.1, drift=.004):
        """length 是八分音符個數；不給就放完採樣自己的尾巴。pitch 是音名、midi 或 None（無音高）"""
        if pitch is None:
            row = table(pack)[self.turn.setdefault(pack, 0) % len(table(pack))]
            self.turn[pack] += 1
            x = row[1]
        else:
            f = freq(midi(pitch) if isinstance(pitch, str) else pitch)
            row = self.pick(pack, f, loud)
            key = (id(row), round(f, 2))
            x = self.pitched.setdefault(key, None)
            if x is None:
                x = self.pitched[key] = sb.resample(row[1], f / row[0])
        keep = len(x) if length is None else min(len(x), int(SR * (length * self.e + release)))
        x = x[:min(keep, SR * 8)].copy()
        fade = min(int(SR * release), len(x))
        x[-fade:] *= np.cos(np.linspace(0, np.pi / 2, fade)) ** 2
        at = int(SR * max((bar * 8 + eighth) * self.e + self.rng.normal(0, drift), 0))
        bus = self.bus.setdefault(pack, np.zeros(self.size))
        end = min(at + len(x), self.size)
        bus[at:end] += x[:end - at] * gain * (1 + self.rng.normal(0, .05))

    def line(self, pack, bar, notes, gain=1.0, **kw):
        """notes 是 '音名:八分音符個數' 用空格隔開，'-' 是休止"""
        e = 0
        for tok in notes.split():
            name, n = tok.split(':')
            n = float(n)
            if name != '-':
                self.put(pack, name, bar, e, n if pack in LONG else None, gain, **kw)
            e += n

    def render(self):
        mix, send = np.zeros((2, self.size)), np.zeros((2, self.size))
        for pack, x in self.bus.items():
            _, pan, wet = PACKS[pack]
            theta = (pan + 1) * np.pi / 4
            stereo = np.stack([x * np.cos(theta), x * np.sin(theta)]) * 2 ** .5
            mix += stereo
            send += stereo * wet
        out = mix + hall(send)
        out /= np.abs(out).max() / .9
        return np.tanh(out * 1.1) / 1.1


LONG = {'trumpetlong', 'cellotrem', 'violatrem', 'violintrem'}


def hall(x, rt=1.9):
    n = int(SR * rt * 1.3)
    t = np.arange(n) / SR
    rng = np.random.default_rng(7)
    size = 1 << int(np.ceil(np.log2(x.shape[1] + n)))
    f = np.fft.rfftfreq(size, 1 / SR)
    tone = (1 - np.exp(-f / 250)) * np.exp(-f / 5500)  # 混響裏低頻和高頻都收一點，不糊
    out = []
    for ch in x:
        ir = rng.standard_normal(n) * 10 ** (-3 * t / rt)
        ir[:int(SR * .018)] = 0
        ir /= (ir ** 2).sum() ** .5
        out.append(np.fft.irfft(np.fft.rfft(ch, size) * np.fft.rfft(ir, size) * tone)[:x.shape[1]])
    return np.array(out)


def name_of(n):
    return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][n % 12] + str(n // 12 - 1)


def up(notes, by):
    return re.sub(r'[A-G][#b]?\d', lambda m: name_of(midi(m[0]) + by), notes)


def brass(s, bar, notes, gain):
    """小號：斷奏定住起音，長音再疊一層延音"""
    s.line('trumpet', bar, notes, gain * .75)
    s.line('trumpetlong', bar, ' '.join(t if float(t.split(':')[1]) >= 2 else '-:' + t.split(':')[1] for t in notes.split()), gain * .55, release=.06)


# 每個和弦：根音（大提琴的音區）、中音區三個音
CH = {
    'Dm': ('D3', 'F3 A3 D4'), 'D': ('D3', 'F#3 A3 D4'), 'Bb': ('Bb2', 'F3 Bb3 D4'), 'C': ('C3', 'G3 C4 E4'), 'A': ('A2', 'E3 A3 C#4'),
    'Gm': ('G2', 'G3 Bb3 D4'), 'G': ('G2', 'G3 B3 D4'), 'Eb': ('Eb3', 'G3 Bb3 Eb4'), 'Em': ('E3', 'G3 B3 E4'), 'Am': ('A2', 'A3 C4 E4'),
    'B': ('B2', 'F#3 B3 D#4'), 'F': ('F3', 'F3 A3 C4'), 'E': ('E3', 'G#3 B3 E4'),
}


def stab(s, name, bar, e, gain=1.0, brass=('horn',)):
    for pack in brass:
        for n in CH[name][1].split():
            s.put(pack, n, bar, e, gain=gain * .42)


def timp(s, name, bar, e, gain=1.0):
    n = midi(CH[name][0])
    while freq(n) > 200:
        n -= 12
    while freq(n) < 108:
        n += 12
    s.put('timp', n, bar, e, gain=gain)


def chase():
    """追逼：156 拍 D 小調。低音弦八分音符連打（3+3+2 的重音），小號主題，中段十六分音符一路往上逼，升一個全音再回來"""
    s = Song(156, 47)
    theme = ('D5:3 A4:1 D5:1 F5:3', 'E5:1 D5:1 C5:2 A4:4', 'Bb4:3 D5:1 F5:1 G5:3', 'G5:1 F5:1 E5:2 C5:4',
             'D5:3 A4:1 D5:1 A5:3', 'Bb5:1 A5:1 G5:2 D5:4', 'C#5:3 E5:1 A5:1 G5:3', 'G5:1 F5:1 E5:2 C#5:4')
    a = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Gm', 'A', 'A']
    prog = ['Dm'] * 6 + ['Bb', 'A'] + a + a[:7] + ['Dm'] + ['Gm', 'A', 'Bb', 'C', 'Dm', 'Eb', 'A', 'A'] + ['Em', 'Em', 'C', 'D', 'Em', 'Am', 'B', 'B'] + ['C', 'C', 'A', 'A']
    for bar, name in enumerate(prog):
        root = midi(CH[name][0])
        level = .55 + .05 * min(bar, 7) if bar < 8 else .9 if bar < 24 else .8 if bar < 30 else 1
        for e in range(8):
            acc = e in (0, 3, 6)
            g = (1 if acc else .6) * level
            s.put('cello', root, bar, e, gain=.85 * g, loud=acc)
            s.put('contra', root - 12, bar, e, gain=.5 * g, loud=acc)
            if bar >= 4:
                s.put('viola', root + 12, bar, e, gain=.45 * g, loud=acc)
        if bar < 4 or (bar % 2 == 0 and bar < 8):
            timp(s, name, bar, 0, .5)
        elif bar >= 8:
            for e in (0, 3, 6):
                timp(s, name, bar, e, .5 if e else .7)
        if 4 <= bar < 8:
            stab(s, name, bar, 3, .7)
            stab(s, name, bar, 6, .8)

    def melody(bar, phrase, by=0, gain=1.0):
        for i, notes in enumerate(phrase):
            notes = up(notes, by)
            brass(s, bar + i, notes, gain)
            stabs = prog[bar + i]
            stab(s, stabs, bar + i, 3, .5 * gain)
            stab(s, stabs, bar + i, 6, .6 * gain)

    melody(8, theme)
    tail = list(theme)
    tail[7] = 'G5:1 F5:1 E5:2 D5:4'
    melody(16, tail, gain=1.1)
    for i, n in enumerate(theme):  # 第二遍小提琴高八度跟上
        s.line('violin', 16 + i, up(tail[i], 12), .5)
    # 中段：前兩拍十六分連打，後面兩下重音，每小節往上走
    for i, (name, top) in enumerate(zip(prog[24:30], 'D5 E5 F5 G5 A5 Bb5'.split())):
        bar = 24 + i
        for k in range(8):
            g = .4 + .08 * k
            s.put('violin', top, bar, k / 2, gain=g, drift=.003)
            s.put('viola', midi(top) - 12, bar, k / 2, gain=g * .7, drift=.003)
        for e, g in ((4, 1), (6, 1.15)):
            stab(s, name, bar, e, g, ('horn', 'trumpet'))
            s.put('tuba', midi(CH[name][0]) - 12, bar, e, gain=.6)
            s.put('snare', None, bar, e, gain=.5)
    for k in range(32):  # 兩小節十六分連打衝上去
        bar = 30 + k // 16
        s.put('violin', 'A5' if k < 16 else 'C#6', bar, (k % 16) / 2, gain=.4 + .012 * k, drift=.003)
        s.put('viola', 'E5', bar, (k % 16) / 2, gain=.25 + .008 * k, drift=.003)
        s.put('snare', None, bar, (k % 16) / 2, gain=.1 + .008 * k)
    s.put('swell', None, 30, 0, gain=.7)
    # 升到 E 小調再走一遍主題
    s.put('crash', None, 32, 0, gain=1.2)
    lifted = list(theme)
    lifted[7] = 'G5:1 F5:1 E5:2 D#5:4'
    lifted = [up(p, 2) for p in lifted[:7]] + ['A5:1 G5:1 F#5:2 D#5:4']
    melody(32, lifted, gain=1.3)
    for i, p in enumerate(lifted):
        s.line('violin', 32 + i, up(p, 12) if i in (0, 1, 2, 4, 6) else p, .55)
        for e in range(0, 8, 2):
            s.put('snare', None, 32 + i, e, gain=.2 + .12 * (e % 4 == 0))
    for bar, (name, top) in enumerate(zip(prog[40:44], 'E5 G5 A5 C#6'.split()), 40):
        for e in range(8):
            g = .55 + .05 * e + .08 * (bar - 40)
            s.put('trumpet', top, bar, e, gain=g * .6)
            stab(s, name, bar, e, g * .5, ('horn', 'trombone'))
            s.put('snare', None, bar, e, gain=.25 + .03 * e)
            s.put('tuba', midi(CH[name][0]) - 12, bar, e, gain=.4)
    # 收在 D 小調上，震音慢慢退下去，接回開頭的連打
    s.put('crash', None, 44, 0, gain=1.2)
    timp(s, 'Dm', 44, 0, 1.2)
    s.put('tuba', 'D2', 44, 0, gain=1)
    for n in 'D5 F5 A5'.split():
        s.put('trumpet', n, 44, 0, gain=.7)
    stab(s, 'Dm', 44, 0, 1.2, ('horn', 'trombone'))
    for pack, n, g in (('cellotrem', 'D3', .7), ('violatrem', 'A3', .5), ('violintrem', 'D4', .4), ('violintrem', 'F4', .35)):
        s.put(pack, n, 44, 0, 18, g, release=3.2)
    return s


SONGS = {'vote': chase}


def main(raw, out, names):
    sb.raw_dir = raw
    sb.PACKS.update({k: (V, v[0]) for k, v in PACKS.items()})
    sb.STRUCK.update({'contrapizz', 'cellopizz', 'piano'})
    ThreadPool(10).map(sb.pack_files, PACKS)
    for name in names or SONGS:
        x = SONGS[name]().render()
        pcm = (np.clip(x.T, -1, 1) * 32767).astype('<i2')
        with wave.open(os.path.join(out, name + '.wav'), 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        print(name, round(len(pcm) / SR, 1), 's', flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
