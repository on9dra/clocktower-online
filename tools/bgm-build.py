#!/usr/bin/env python3
"""做 public/bgm/*.m4a：截到合適的長度、響度統一、轉 AAC。
用法：python tools/bgm-build.py 原始音頻目錄
需要 ffmpeg。原始文件來自 OpenGameArt，來源和授權見 docs/sfx-sources.md"""
import glob
import os
import re
import subprocess
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'bgm')
LONGEST = 150  # 秒。服務器帶寬小，夠長的曲子也不全要

# 輸出名: 目標響度 LUFS。提名要激昂，比白天和夜晚響一點
LOUD = {'day-a': -21, 'day-b': -21, 'day-c': -21, 'night-a': -21, 'night-b': -21, 'night-c': -21, 'vote-a': -18, 'vote-b': -18, 'vote-c': -18}


def loudness(path):
    log = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-t', str(LONGEST), '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8', errors='ignore').stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', log)[-1]), float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', log)[-1])


def main(raw):
    os.makedirs(OUT, exist_ok=True)
    for name, target in LOUD.items():
        src = glob.glob(os.path.join(raw, name + '.*'))[0]
        level, peak = loudness(src)
        gain = min(target - level, -1 - peak)  # 峰值頂到 -1dB 時寧可輕一點
        out = os.path.join(OUT, name + '.m4a')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-t', str(LONGEST), '-af', f'volume={gain:.2f}dB', '-ar', '44100', '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart', out], check=True)
        print(f'{name:8s} {level:6.1f} LUFS -> {level + gain:6.1f}  {os.path.getsize(out) / 1e6:5.2f}MB')


if __name__ == '__main__':
    main(sys.argv[1])
