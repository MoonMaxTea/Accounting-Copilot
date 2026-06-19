#!/usr/bin/env bash
# Extended VM UI test: Evidence tab → select note → click citation
set -euo pipefail

export DISPLAY="${DISPLAY:-:1}"

WIN=$(xdotool search --name "AccoutingStandards Desktop" 2>/dev/null | head -1 || true)
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
sleep 0.8

# First project in left tree (~15% width, ~28% height)
xdotool mousemove $((POS_X + WIDTH * 15 / 100)) $((POS_Y + HEIGHT * 28 / 100)) click 1
sleep 0.8

# IFRS citation in center panel (~45% width, ~38% height)
xdotool mousemove $((POS_X + WIDTH * 45 / 100)) $((POS_Y + HEIGHT * 38 / 100)) click 1
sleep 0.5

echo "  ✓ Evidence → 选择笔记 → 点击 IFRS 引用"
