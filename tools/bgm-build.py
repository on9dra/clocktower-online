#!/usr/bin/env python3
"""做 public/bgm/*.m4a：截到合適的長度、響度統一、轉 AAC。自己編的曲子先用 bgm-score.py 渲染成 wav。
用法：python tools/bgm-build.py 原始音頻目錄 [曲名...]（不給曲名就全做）
需要 ffmpeg。其餘原始文件來自 OpenGameArt，來源和授權見 docs/sfx-sources.md"""
import glob
import os
import re
import subprocess
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'bgm')
LONGEST = 150  # 秒。服務器帶寬小，夠長的曲子也不全要

# 輸出名: 目標響度 LUFS。提名要激昂，比白天和夜晚響一點；大廳在填房間號、等人，退後一點
LOUD = {'day': -21, 'night': -21, 'vote': -18, 'lobby': -22}
# 無縫循環的曲子：文件尾巴多帶這麼多秒開頭，bgm.js 循環時兩副播放器放的是同樣的聲音，交叉淡化才不打架。
# 要夠 bgm.js 的 LOOP 在開頭之後找個兩個音之間的交接點，再留點餘量
TAIL = {'day': 1.5}
# 有前奏的曲子：(從, 接到)。原曲放到「從」那一秒，聽起來就是「接到」那一秒，在那裏剪開，後面補 SPLICE_TAIL 秒「接到」之後的音樂。
# bgm.js 的 LOOP 在剪口之後、兩個音之間交接，兩副播放器放的是同一段聲音。
# 大廳那首：A 段 0–21 秒沒有低音，76 秒起帶著低音再奏一遍 A，到 B 段要起的地方原曲淡出。
# 所以第一次從頭放，之後每圈從第二遍 A 的 97.068 秒接回第一遍 21.07 秒（B 段低音進來前一刻：兩遍音量差不到 1dB，第二遍的低音已經自己衰減完）。
SPLICE = {'lobby': (97.068, 21.07)}
SPLICE_FADE = .06  # 剪口處的等功率交叉淡化，在接點前結束
SPLICE_TAIL = 1.5  # 後一副播放器起晚了，前一副還有同樣的聲音可放


def loudness(path):
    log = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-t', str(LONGEST), '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8', errors='ignore').stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', log)[-1]), float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', log)[-1])


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True, check=True).stdout)


def main(raw, names):
    os.makedirs(OUT, exist_ok=True)
    for name in names or LOUD:
        target = LOUD[name]
        src = glob.glob(os.path.join(raw, name + '.*'))[0]
        level, peak = loudness(src)
        gain = min(target - level, -1 - peak)  # 峰值頂到 -1dB 時寧可輕一點
        out = os.path.join(OUT, name + '.m4a')
        enc = ['-ar', '44100', '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart', out]
        if name in SPLICE:
            cut, to = SPLICE[name]
            graph = (f'[0:a]asplit[x][y];[x]atrim=0:{cut},asetpts=PTS-STARTPTS[a];'
                     f'[y]atrim={to - SPLICE_FADE}:{to + SPLICE_TAIL},asetpts=PTS-STARTPTS[b];'
                     f'[a][b]acrossfade=d={SPLICE_FADE}:c1=qsin:c2=qsin,volume={gain:.2f}dB')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-filter_complex', graph, *enc], check=True)
        else:
            length = min(duration(src) + TAIL.get(name, 0), LONGEST)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-stream_loop', '1', '-i', src, '-t', f'{length:.3f}', '-af', f'volume={gain:.2f}dB', *enc], check=True)
        print(f'{name:8s} {level:6.1f} LUFS -> {level + gain:6.1f}  {os.path.getsize(out) / 1e6:5.2f}MB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
