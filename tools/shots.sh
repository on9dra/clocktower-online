#!/usr/bin/env bash
# 大廳的三張對局截圖：用無頭 Chrome 打開演示頁（bare 去掉演示條，run= 依次點的步驟），截圖後轉成 webp。
# 先 npm start；用法：bash tools/shots.sh（Chrome 不在默認位置時設 CHROME=...）
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || echo "/c/Program Files/Google/Chrome/Application/chrome.exe")}"
URL="${URL:-http://localhost:3000}"
TMP="$(mktemp -d)"
shot() { # 名字 演示參數 等多久（毫秒，虛擬時間）
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$TMP/prof" --window-size=1280,800 \
    --virtual-time-budget="$3" --screenshot="$TMP/$1.png" "$URL/demo.html?bare&$2" >/dev/null 2>&1
}
shot start 's=scripts' 4000         # 說書人準備：劇本、隨機抽取
shot info 's=info&run=1' 6000       # 玩家收到信息：面板 + 座位上的標記（演示條上不顯示的截圖場景）
shot vote 's=vote&run=1,2,7' 14000  # 提名、大家舉手、計票時鐘數到一半
python -I - "$TMP" public/img/shots <<'PY'
import sys, os
from PIL import Image
src, out = sys.argv[1:]
for n in ['start', 'info', 'vote']:
    Image.open(os.path.join(src, n + '.png')).convert('RGB').resize((1000, 625), Image.LANCZOS).save(os.path.join(out, n + '.webp'), quality=82, method=6)
print('shots ok')
PY
rm -rf "$TMP"
