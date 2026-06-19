#!/usr/bin/env bash
# Extended VM UI test: Evidence tab → DTA note → click ASC citation for highlight
set -euo pipefail

export DISPLAY="${DISPLAY:-:1}"

WIN=$(xdotool search --name "Accounting Copilot" 2>/dev/null | head -1 || true)
[[ -n "${WIN}" ]] || { echo "✗ 未找到应用窗口"; exit 1; }

read -r POS_X POS_Y WIDTH HEIGHT < <(
  xdotool getwindowgeometry "${WIN}" | awk '
    /Position:/ { gsub(/[^0-9,]/,"",$2); split($2,a,","); px=a[1]; py=a[2] }
    /Geometry:/ { gsub(/[^0-9x]/,"",$2); split($2,a,"x"); w=a[1]; h=a[2] }
    END { print px, py, w, h }
  '
)

xdotool windowactivate --sync "${WIN}"
sleep 0.4

# Evidence tab
xdotool mousemove $((POS_X + WIDTH * 72 / 100)) $((POS_Y + 45)) click 1
sleep 1.0

# Center panel: click ASC 740 citation in DTA note (~50% width, ~22% height)
xdotool mousemove $((POS_X + WIDTH * 50 / 100)) $((POS_Y + HEIGHT * 22 / 100)) click 1
sleep 0.8

echo "  ✓ Evidence → DTA 笔记 → 点击 ASC 740 引用（右侧应高亮段落）"
